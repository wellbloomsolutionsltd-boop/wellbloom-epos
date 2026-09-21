import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePosCheckoutDto } from "./dto/create-pos-checkout.dto";

@Injectable()
export class PosCheckoutsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getStatus(
    id: string,
    user: AuthenticatedUser,
  ) {
    const checkout =
      await this.prisma.posCheckout.findFirst({
        where: {
          id,
          tenantId: user.tenantId,
          branchId:
            user.branchId ?? undefined,
        },
        include: {
          sale: {
            include: {
              branch: true,
              items: {
                include: {
                  product: true,
                },
              },
              payments: true,
            },
          },
        },
      });

    if (!checkout) {
      throw new NotFoundException(
        "POS checkout not found",
      );
    }

    return {
      id: checkout.id,
      status: checkout.status,
      totalAmount: checkout.totalAmount,
      sale: checkout.sale,
    };
  }

  async create(
    dto: CreatePosCheckoutDto,
    user: AuthenticatedUser,
  ) {
    const branchId = user.branchId;

    if (!branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const shift = await this.prisma.shift.findFirst({
      where: {
        tenantId: user.tenantId,
        branchId,
        userId: user.sub,
        status: "OPEN",
      },
    });

    if (!shift) {
      throw new BadRequestException(
        "You must open a cashier shift before starting checkout",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.customerId) {
        const customer = await tx.customer.findFirst({
          where: {
            id: dto.customerId,
            tenantId: user.tenantId,
          },
        });

        if (!customer) {
          throw new NotFoundException("Customer not found");
        }
      }

      const calculatedItems: {
        productId: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }[] = [];

      let subtotal = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            tenantId: user.tenantId,
            isActive: true,
          },
        });

        if (!product) {
          throw new NotFoundException(
            `Product ${item.productId} not found`,
          );
        }

        const inventory = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId,
              productId: product.id,
            },
          },
        });

        if (!inventory) {
          throw new BadRequestException(
            `${product.name} has no inventory record`,
          );
        }

        const quantity = new Prisma.Decimal(item.quantity);
        const reserved =
          await tx.inventoryReservation.aggregate({
            where: {
              tenantId: user.tenantId,
              branchId,
              productId: product.id,
              status: "ACTIVE",
            },
            _sum: {
              quantity: true,
            },
          });

        const reservedQuantity =
          reserved._sum.quantity ?? new Prisma.Decimal(0);
        const availableQuantity = inventory.quantity.sub(
          reservedQuantity,
        );

        if (availableQuantity.lessThan(quantity)) {
          throw new BadRequestException(
            `Insufficient available stock for ${product.name}`,
          );
        }

        const unitPrice = product.sellingPrice;
        const lineTotal = unitPrice.mul(quantity);

        subtotal = subtotal.add(lineTotal);
        calculatedItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          discountAmount: new Prisma.Decimal(0),
          lineTotal,
        });
      }

      const checkoutNumber = `POSCHK-${Date.now()}`;
      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000,
      );

      const checkout = await tx.posCheckout.create({
        data: {
          checkoutNumber,
          tenantId: user.tenantId,
          branchId,
          cashierId: user.sub,
          shiftId: shift.id,
          customerId: dto.customerId,
          status: "AWAITING_PAYMENT",
          subtotal,
          discountAmount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: subtotal,
          reservedAt: new Date(),
          reservationExpiresAt: expiresAt,
          items: {
            create: calculatedItems,
          },
        },
        include: {
          items: true,
        },
      });

      for (const item of calculatedItems) {
        await tx.inventoryReservation.create({
          data: {
            tenantId: user.tenantId,
            branchId,
            productId: item.productId,
            posCheckoutId: checkout.id,
            quantity: item.quantity,
            status: "ACTIVE",
            expiresAt,
          },
        });
      }

      return {
        success: true,
        checkout,
      };
    });
  }

  async confirmPaidPosCheckoutWithTx(
    tx: Prisma.TransactionClient,
    posCheckoutId: string,
    paymentId: string,
  ) {
    const now = new Date();
    const checkout =
      await tx.posCheckout.findUnique({
        where: {
          id: posCheckoutId,
        },
        include: {
          items: true,
          reservations: {
            where: {
              status: "ACTIVE",
            },
          },
          sale: true,
        },
      });

    if (!checkout) {
      throw new NotFoundException(
        "POS checkout not found",
      );
    }

    if (checkout.saleId && checkout.sale) {
      return checkout.sale;
    }

    if (checkout.status !== "PAYMENT_PENDING") {
      throw new BadRequestException(
        `POS checkout cannot be completed from status ${checkout.status}`,
      );
    }

    if (
      checkout.reservationExpiresAt &&
      checkout.reservationExpiresAt <= now
    ) {
      throw new BadRequestException(
        "POS checkout reservation has expired",
      );
    }

    const payment =
      await tx.paymentTransaction.findUnique({
        where: {
          id: paymentId,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        "Payment transaction not found",
      );
    }

    if (payment.targetType !== "POS_CHECKOUT") {
      throw new BadRequestException(
        "Payment does not belong to a POS checkout",
      );
    }

    if (payment.posCheckoutId !== checkout.id) {
      throw new BadRequestException(
        "Payment belongs to a different POS checkout",
      );
    }

    if (!payment.amount.equals(checkout.totalAmount)) {
      throw new BadRequestException(
        "Payment amount does not match POS checkout total",
      );
    }

    if (
      payment.providerAmount &&
      !payment.providerAmount.equals(
        checkout.totalAmount,
      )
    ) {
      throw new BadRequestException(
        "M-Pesa callback amount does not match POS checkout total",
      );
    }

    for (const item of checkout.items) {
      const reservation =
        checkout.reservations.find(
          (entry) =>
            entry.productId === item.productId,
        );

      if (!reservation) {
        throw new BadRequestException(
          `Active reservation missing for product ${item.productId}`,
        );
      }

      if (!reservation.quantity.equals(item.quantity)) {
        throw new BadRequestException(
          `Reserved quantity does not match checkout quantity for product ${item.productId}`,
        );
      }
    }

    const saleNumber =
      await this.generateSaleNumber(tx);
    const movementSnapshots: {
      productId: string;
      quantity: Prisma.Decimal;
      quantityBefore: Prisma.Decimal;
      quantityAfter: Prisma.Decimal;
    }[] = [];

    for (const item of checkout.items) {
      const inventoryBefore =
        await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: checkout.branchId,
              productId: item.productId,
            },
          },
        });

      if (!inventoryBefore) {
        throw new BadRequestException(
          `Inventory record missing for product ${item.productId}`,
        );
      }

      const otherReservations =
        await tx.inventoryReservation.aggregate({
          where: {
            tenantId: checkout.tenantId,
            branchId: checkout.branchId,
            productId: item.productId,
            status: "ACTIVE",
            NOT: {
              posCheckoutId: checkout.id,
            },
          },
          _sum: {
            quantity: true,
          },
        });

      const otherReserved =
        otherReservations._sum.quantity ??
        new Prisma.Decimal(0);
      const availableForThisCheckout =
        inventoryBefore.quantity.sub(otherReserved);

      if (
        availableForThisCheckout.lessThan(
          item.quantity,
        )
      ) {
        throw new BadRequestException(
          `Insufficient stock while finalizing product ${item.productId}`,
        );
      }

      const updated =
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET
            "quantity" =
              "quantity" - ${item.quantity}
          WHERE
            "branchId" = ${checkout.branchId}
            AND
            "productId" = ${item.productId}
            AND
            "quantity" >= ${item.quantity}
        `;

      if (updated !== 1) {
        throw new BadRequestException(
          `Unable to consume stock for product ${item.productId}`,
        );
      }

      const inventoryAfter =
        await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: checkout.branchId,
              productId: item.productId,
            },
          },
        });

      if (!inventoryAfter) {
        throw new BadRequestException(
          "Inventory record missing after M-Pesa sale",
        );
      }

      movementSnapshots.push({
        productId: item.productId,
        quantity: item.quantity,
        quantityBefore: inventoryBefore.quantity,
        quantityAfter: inventoryAfter.quantity,
      });
    }

    const sale = await tx.sale.create({
      data: {
        saleNumber,
        receiptNumber: saleNumber,
        tenantId: checkout.tenantId,
        branchId: checkout.branchId,
        cashierId: checkout.cashierId,
        shiftId: checkout.shiftId,
        customerId: checkout.customerId,
        subtotal: checkout.subtotal,
        discountAmount: checkout.discountAmount,
        taxAmount: checkout.taxAmount,
        totalAmount: checkout.totalAmount,
        amountPaid: checkout.totalAmount,
        changeAmount: new Prisma.Decimal(0),
        status: "COMPLETED",
        items: {
          create: checkout.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: new Prisma.Decimal(0),
            lineTotal: item.lineTotal,
          })),
        },
        payments: {
          create: {
            method: "MPESA",
            amount: checkout.totalAmount,
            reference:
              payment.externalReference ??
              payment.providerCheckoutId,
          },
        },
      },
      include: {
        items: true,
        payments: true,
      },
    });

    for (const snapshot of movementSnapshots) {
      await tx.inventoryMovement.create({
        data: {
          tenantId: checkout.tenantId,
          branchId: checkout.branchId,
          productId: snapshot.productId,
          type: "POS_SALE",
          quantity: snapshot.quantity.neg(),
          quantityBefore: snapshot.quantityBefore,
          quantityAfter: snapshot.quantityAfter,
          referenceType: "SALE",
          referenceId: sale.id,
          referenceNumber: sale.saleNumber,
          createdById: checkout.cashierId,
        },
      });
    }

    await tx.inventoryReservation.updateMany({
      where: {
        posCheckoutId: checkout.id,
        status: "ACTIVE",
      },
      data: {
        status: "CONSUMED",
        consumedAt: now,
      },
    });

    await tx.posCheckout.update({
      where: {
        id: checkout.id,
      },
      data: {
        status: "COMPLETED",
        saleId: sale.id,
        completedAt: now,
      },
    });

    await tx.paymentTransaction.update({
      where: {
        id: payment.id,
      },
      data: {
        saleId: sale.id,
      },
    });

    return sale;
  }

  private async generateSaleNumber(
    tx: Prisma.TransactionClient,
  ) {
    const today = new Date();
    const date =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const random = Math.floor(
      100000 + Math.random() * 900000,
    );

    return `SALE-${date}-${random}`;
  }
}
