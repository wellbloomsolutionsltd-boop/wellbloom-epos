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

  async createOrder(
    dto: CreateOrderDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const branch =
          await tx.branch.findFirst({
            where: {
              id:
                dto.branchId,
              tenantId:
                user.tenantId,
            },
          });

        if (!branch) {
          throw new NotFoundException(
            "Fulfilment branch not found",
          );
        }

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
            throw new NotFoundException(
              "Customer not found",
            );
          }
        }

        const calculatedItems: {
          productId: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          lineTotal: Prisma.Decimal;
        }[] = [];

        let subtotal =
          new Prisma.Decimal(0);

        for (const requestedItem of dto.items) {
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

          const available =
            new Prisma.Decimal(
              inventory.quantity,
            ).sub(
              inventory.reservedQty,
            );

          if (
            available.lessThan(
              requestedQty,
            )
          ) {
            throw new BadRequestException(
              `Insufficient stock for ${product.name}. Available: ${available.toString()}`,
            );
          }

          await tx.inventory.update({
            where: {
              branchId_productId: {
                branchId:
                  branch.id,
                productId:
                  product.id,
              },
            },
            data: {
              reservedQty: {
                increment:
                  requestedQty,
              },
            },
          });

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
            customerId:
              dto.customerId,
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
      },
    );
  }

  async confirmOrder(
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
                  "AWAITING_PAYMENT",
                  "PENDING",
                ],
              },
            },
            include: {
              items: true,
            },
          });

        if (!order) {
          throw new NotFoundException(
            "Order not found or cannot be confirmed",
          );
        }

        for (const item of order.items) {
          const inventory =
            await tx.inventory.findUnique({
              where: {
                branchId_productId: {
                  branchId:
                    order.branchId,
                  productId:
                    item.productId,
                },
              },
            });

          if (!inventory) {
            throw new BadRequestException(
              "Inventory record missing",
            );
          }

          if (
            new Prisma.Decimal(
              inventory.reservedQty,
            ).lessThan(
              item.quantity,
            )
          ) {
            throw new BadRequestException(
              "Reserved inventory is inconsistent",
            );
          }

          await tx.inventory.update({
            where: {
              branchId_productId: {
                branchId:
                  order.branchId,
                productId:
                  item.productId,
              },
            },
            data: {
              quantity: {
                decrement:
                  item.quantity,
              },
              reservedQty: {
                decrement:
                  item.quantity,
              },
            },
          });
        }

        return tx.order.update({
          where: {
            id:
              order.id,
          },
          data: {
            status:
              "CONFIRMED",
            paymentStatus:
              "PAID",
            confirmedAt:
              new Date(),
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });
      },
    );
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
            },
          });

        if (!order) {
          throw new NotFoundException(
            "Order cannot be cancelled",
          );
        }

        for (const item of order.items) {
          await tx.inventory.update({
            where: {
              branchId_productId: {
                branchId:
                  order.branchId,
                productId:
                  item.productId,
              },
            },
            data: {
              reservedQty: {
                decrement:
                  item.quantity,
              },
            },
          });
        }

        return tx.order.update({
          where: {
            id:
              order.id,
          },
          data: {
            status:
              "CANCELLED",
            cancelledAt:
              new Date(),
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
              items: true,
            },
          });

        for (const order of orders) {
          for (const item of order.items) {
            await tx.inventory.update({
              where: {
                branchId_productId: {
                  branchId:
                    order.branchId,
                  productId:
                    item.productId,
                },
              },
              data: {
                reservedQty: {
                  decrement:
                    item.quantity,
                },
              },
            });
          }
        }

        if (orders.length === 0) {
          return [];
        }

        return tx.order.updateMany({
          where: {
            id: {
              in: orders.map(
                (order) => order.id,
              ),
            },
          },
          data: {
            status:
              "CANCELLED",
            cancelledAt:
              now,
          },
        });
      },
    );
  }
}
