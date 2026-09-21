import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  Prisma,
} from "@prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

import {
  CreateOrderDto,
} from "./dto/create-order.dto";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

  private normalizeItems(
    items: {
      productId: string;
      quantity: number;
    }[],
  ) {
    const map = new Map<string, number>();

    for (const item of items) {
      map.set(
        item.productId,
        (map.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return Array.from(map.entries()).map(
      ([productId, quantity]) => ({
        productId,
        quantity,
      }),
    );
  }

  async createOrder(
    dto: CreateOrderDto,
    user: AuthenticatedUser,
  ) {
    const normalizedItems = this.normalizeItems(dto.items);

    return this.prisma.$transaction(
      async (tx) => {
        if (dto.idempotencyKey) {
          const existingOrder =
            await tx.order.findFirst({
              where: {
                idempotencyKey:
                  dto.idempotencyKey,
                tenantId:
                  user.tenantId,
              },
              include: {
                items: {
                  include: {
                    product: true,
                  },
                },
                branch: true,
                customer: true,
              },
            });

          if (existingOrder) {
            return existingOrder;
          }
        }

        const branch =
          await tx.branch.findFirst({
            where: {
              id:
                dto.branchId,
              tenantId:
                user.tenantId,
              isActive: true,
              fulfilsEcommerce: true,
            },
          });

        if (!branch) {
          throw new NotFoundException(
            "Fulfilment branch not found",
          );
        }

        if (
          dto.fulfilmentMethod ===
            "PICKUP" &&
          !branch.allowsPickup
        ) {
          throw new BadRequestException(
            "Pickup is not available at this branch",
          );
        }

        let customerId: string | null = null;

        if (dto.customerId) {
          const customer =
            await tx.customer.findFirst({
              where: {
                id:
                  dto.customerId,
                tenantId:
                  user.tenantId,
                isActive: true,
              },
            });

          if (!customer) {
            throw new BadRequestException(
              "Customer not found",
            );
          }

          customerId = customer.id;
        }

        const calculatedItems: {
          productId: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          lineTotal: Prisma.Decimal;
        }[] = [];

        let subtotal =
          new Prisma.Decimal(0);

        for (const requestedItem of normalizedItems) {
          const product =
            await tx.product.findFirst({
              where: {
                id:
                  requestedItem.productId,
                tenantId:
                  user.tenantId,
                isActive: true,
              },
            });

          if (!product) {
            throw new NotFoundException(
              "Product not found",
            );
          }

          const inventory =
            await tx.inventory.findUnique({
              where: {
                branchId_productId: {
                  branchId:
                    branch.id,
                  productId:
                    product.id,
                },
              },
            });

          if (!inventory) {
            throw new BadRequestException(
              `${product.name} is unavailable at this branch`,
            );
          }

          const requestedQty =
            new Prisma.Decimal(
              requestedItem.quantity,
            );

          const updated =
            await tx.$executeRaw`
              UPDATE "Inventory"
              SET
                "reservedQty" =
                  "reservedQty" + ${requestedQty}
              WHERE
                "branchId" = ${branch.id}
                AND
                "productId" = ${product.id}
                AND
                (
                  "quantity" -
                  "reservedQty"
                ) >= ${requestedQty}
            `;

          if (updated !== 1) {
            throw new BadRequestException(
              `Insufficient available stock for ${product.name}`,
            );
          }

          const unitPrice =
            new Prisma.Decimal(
              product.sellingPrice,
            );

          const lineTotal =
            unitPrice.mul(
              requestedQty,
            );

          subtotal =
            subtotal.add(lineTotal);

          calculatedItems.push({
            productId:
              product.id,
            quantity:
              requestedQty,
            unitPrice,
            lineTotal,
          });
        }

        const deliveryFee =
          new Prisma.Decimal(0);
        const discount =
          new Prisma.Decimal(0);
        const total = subtotal
          .sub(discount)
          .add(deliveryFee);
        const now = new Date();
        const reservationExpiresAt =
          new Date(
            now.getTime() +
              30 * 60 * 1000,
          );
        const orderNumber =
          `WB-${Date.now()}`;

        return tx.order.create({
          data: {
            orderNumber,
            tenantId:
              user.tenantId,
            branchId:
              branch.id,
            customerId,
            idempotencyKey:
              dto.idempotencyKey,
            fulfilmentMethod:
              dto.fulfilmentMethod,
            subtotal,
            discount,
            deliveryFee,
            total,
            recipientName:
              dto.recipientName,
            recipientPhone:
              dto.recipientPhone,
            deliveryAddress:
              dto.deliveryAddress,
            notes:
              dto.notes,
            status:
              "AWAITING_PAYMENT",
            paymentStatus:
              "PENDING",
            reservedAt:
              now,
            reservationExpiresAt,
            items: {
              create:
                calculatedItems,
            },
            reservations: {
              create: normalizedItems.map(
                (item) => ({
                  tenantId:
                    user.tenantId,
                  branchId:
                    branch.id,
                  productId:
                    item.productId,
                  quantity:
                    new Prisma.Decimal(
                      item.quantity,
                    ),
                  expiresAt:
                    reservationExpiresAt,
                }),
              ),
            },
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
            branch: true,
            customer: true,
            reservations: {
              include: {
                product: true,
              },
            },
          },
        });
      },
    );
  }

  async confirmPaidOrderWithTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    createdById?: string,
  ) {
    const order =
      await tx.order.findFirst({
        where: {
          id:
            orderId,
          status:
            "AWAITING_PAYMENT",
        },
        include: {
          items: true,
          reservations: {
            where: {
              status:
                "ACTIVE",
            },
          },
        },
      });

    if (!order) {
      throw new NotFoundException(
        "Order not found or cannot be confirmed",
      );
    }

    if (
      order.reservations.length !==
      order.items.length
    ) {
      throw new BadRequestException(
        "Order reservation records are incomplete",
      );
    }

    const claimed =
      await tx.order.updateMany({
        where: {
          id:
            order.id,
          status:
            "AWAITING_PAYMENT",
        },
        data: {
          status:
            "CONFIRMED",
          paymentStatus:
            "PAID",
          confirmedAt:
            new Date(),
        },
      });

    if (claimed.count !== 1) {
      throw new BadRequestException(
        "Order has already been processed",
      );
    }

    for (const reservation of order.reservations) {
      const inventoryBefore =
        await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId:
                reservation.branchId,
              productId:
                reservation.productId,
            },
          },
        });

      if (!inventoryBefore) {
        throw new BadRequestException(
          "Inventory record missing",
        );
      }

      const updated =
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET
            "quantity" =
              "quantity" - ${reservation.quantity},
            "reservedQty" =
              "reservedQty" - ${reservation.quantity}
          WHERE
            "branchId" = ${reservation.branchId}
            AND
            "productId" = ${reservation.productId}
            AND
            "quantity" >= ${reservation.quantity}
            AND
            "reservedQty" >= ${reservation.quantity}
        `;

      if (updated !== 1) {
        throw new BadRequestException(
          "Inventory reservation is inconsistent",
        );
      }

      const inventoryAfter =
        await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId:
                reservation.branchId,
              productId:
                reservation.productId,
            },
          },
        });

      if (!inventoryAfter) {
        throw new BadRequestException(
          "Inventory record missing after ecommerce sale",
        );
      }

      const consumed =
        await tx.inventoryReservation.updateMany({
          where: {
            id:
              reservation.id,
            status:
              "ACTIVE",
          },
          data: {
            status:
              "CONSUMED",
            consumedAt:
              new Date(),
          },
        });

      if (consumed.count !== 1) {
        throw new BadRequestException(
          "Inventory reservation is inconsistent",
        );
      }

      await tx.inventoryMovement.create({
        data: {
          tenantId:
            order.tenantId,
          branchId:
            reservation.branchId,
          productId:
            reservation.productId,
          type:
            "ECOMMERCE_SALE",
          quantity:
            new Prisma.Decimal(
              reservation.quantity,
            ).neg(),
          quantityBefore:
            inventoryBefore.quantity,
          quantityAfter:
            inventoryAfter.quantity,
          referenceType:
            "ORDER",
          referenceId:
            order.id,
          referenceNumber:
            order.orderNumber,
          createdById,
        },
      });
    }

    return tx.order.findUnique({
      where: {
        id:
          order.id,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        reservations: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async cancelOrder(
    orderId: string,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findFirst({
            where: {
              id:
                orderId,
              tenantId:
                user.tenantId,
              status: {
                in: [
                  "PENDING",
                  "AWAITING_PAYMENT",
                ],
              },
            },
            include: {
              items: true,
              reservations: {
                where: {
                  status:
                    "ACTIVE",
                },
              },
            },
          });

        if (!order) {
          throw new BadRequestException(
            "Order is already cancelled or no longer cancellable.",
          );
        }

        const claimed =
          await tx.order.updateMany({
            where: {
              id:
                order.id,
              status: {
                in: [
                  "PENDING",
                  "AWAITING_PAYMENT",
                ],
              },
            },
            data: {
              status:
                "CANCELLED",
              cancelledAt:
                new Date(),
            },
          });

        if (claimed.count !== 1) {
          throw new BadRequestException(
            "Order is already cancelled or no longer cancellable.",
          );
        }

        for (const reservation of order.reservations) {
          const released =
            await tx.$executeRaw`
              UPDATE "Inventory"
              SET
                "reservedQty" =
                  "reservedQty" - ${reservation.quantity}
              WHERE
                "branchId" = ${reservation.branchId}
                AND
                "productId" = ${reservation.productId}
                AND
                "reservedQty" >= ${reservation.quantity}
            `;

          if (released !== 1) {
            throw new BadRequestException(
              "Inventory reservation is inconsistent",
            );
          }

          const releasedReservation =
            await tx.inventoryReservation.updateMany({
              where: {
                id:
                  reservation?.id,
                status:
                  "ACTIVE",
              },
              data: {
                status:
                  "RELEASED",
                releasedAt:
                  new Date(),
              },
            });

          if (releasedReservation.count !== 1) {
            throw new BadRequestException(
              "Inventory reservation is inconsistent",
            );
          }
        }

        return tx.order.findUnique({
          where: {
            id:
              order.id,
          },
          include: {
            reservations: true,
          },
        });
      },
    );
  }

  async releaseExpiredReservations() {
    const now = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        const orders =
          await tx.order.findMany({
            where: {
              status:
                "AWAITING_PAYMENT",
              reservationExpiresAt: {
                lte: now,
              },
            },
            include: {
              reservations: {
                where: {
                  status:
                    "ACTIVE",
                },
              },
            },
          });

        let releasedCount = 0;

        for (const order of orders) {
          for (const reservation of order.reservations) {
            const claimed =
              await tx.inventoryReservation.updateMany({
                where: {
                  id:
                    reservation.id,
                  status:
                    "ACTIVE",
                },
                data: {
                  status:
                    "EXPIRED",
                  expiredAt:
                    now,
                },
              });

            if (claimed.count !== 1) {
              continue;
            }

            const released =
              await tx.$executeRaw`
                UPDATE "Inventory"
                SET
                  "reservedQty" =
                    "reservedQty" - ${reservation.quantity}
                WHERE
                  "branchId" = ${reservation.branchId}
                  AND
                  "productId" = ${reservation.productId}
                  AND
                  "reservedQty" >= ${reservation.quantity}
              `;

            if (released !== 1) {
              throw new BadRequestException(
                "Inventory reservation is inconsistent",
              );
            }

            releasedCount++;
          }
        }

        const expiredOrders =
          await tx.order.findMany({
            where: {
              status:
                "AWAITING_PAYMENT",
              reservationExpiresAt: {
                lte: now,
              },
              reservations: {
                none: {
                  status:
                    "ACTIVE",
                },
              },
            },
            select: {
              id: true,
            },
          });

        for (const order of expiredOrders) {
          await tx.order.updateMany({
            where: {
              id:
                order.id,
              status:
                "AWAITING_PAYMENT",
            },
            data: {
              status:
                "FAILED",
              paymentStatus:
                "FAILED",
            },
          });
        }

        return {
          releasedCount,
        };
      },
    );
  }
}
