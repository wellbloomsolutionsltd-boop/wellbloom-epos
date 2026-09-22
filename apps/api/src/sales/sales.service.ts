import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PricingService } from "../pricing/pricing.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PricingService)
    private readonly pricingService: PricingService,
  ) {}

  async createSale(
    dto: CreateSaleDto,
    user: AuthenticatedUser,
  ) {
    const branchId = user.branchId;

    if (!branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    if (
      dto.payments.some(
        (payment) =>
          payment.method ===
          "INSURANCE",
      )
    ) {
      throw new BadRequestException(
        "Insurance payments require insurance authorization and claims processing",
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
        "You must open a cashier shift before making sales",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: {
          id: branchId,
          tenantId: user.tenantId,
        },
      });

      if (!branch) {
        throw new NotFoundException(
          "Branch was not found for this tenant",
        );
      }

      let customerId: string | null = null;

      if (dto.customerId) {
        const customer = await tx.customer.findFirst({
          where: {
            id: dto.customerId,
            tenantId: user.tenantId,
            isActive: true,
          },
        });

        if (!customer) {
          throw new BadRequestException("Customer not found");
        }

        customerId = customer.id;
      }

      const calculatedItems: {
        productId: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }[] = [];

      const movementSnapshots: {
        productId: string;
        quantityBefore: Prisma.Decimal;
        quantityAfter: Prisma.Decimal;
      }[] = [];

      let subtotal = new Prisma.Decimal(0);

      for (const requestedItem of dto.items) {
        const product = await tx.product.findFirst({
          where: {
            id: requestedItem.productId,
            tenantId: user.tenantId,
            isActive: true,
          },
        });

        if (!product) {
          throw new NotFoundException(
            `Product ${requestedItem.productId} was not found`,
          );
        }

        const quantity = new Prisma.Decimal(
          requestedItem.quantity,
        );
        const resolvedPrice =
          await this.pricingService.resolveProductPrice({
            tenantId: user.tenantId,
            productId: product.id,
            branchId: user.branchId,
            channel: "POS",
            tx,
          });
        const unitPrice = resolvedPrice.price;
        const lineTotal = unitPrice.mul(quantity);

        const inventoryBefore = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId,
              productId: product.id,
            },
          },
        });

        if (!inventoryBefore) {
          throw new BadRequestException(
            `Inventory not found for ${product.name}`,
          );
        }

        const updated =
          await tx.$executeRaw`
            UPDATE "Inventory"
            SET
              "quantity" =
                "quantity" - ${quantity}
            WHERE
              "branchId" = ${user.branchId}
              AND
              "productId" = ${product.id}
              AND
              (
                "quantity" - COALESCE(
                  (
                    SELECT SUM("quantity")
                    FROM "InventoryReservation"
                    WHERE
                      "tenantId" = ${user.tenantId}
                      AND
                      "branchId" = ${user.branchId}
                      AND
                      "productId" = ${product.id}
                      AND
                      "status" = 'ACTIVE'
                  ),
                  0
                )
              ) >= ${quantity}
          `;

        if (updated !== 1) {
          throw new BadRequestException(
            `Insufficient available stock for ${product.name}`,
          );
        }

        const inventoryAfter = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: user.branchId!,
              productId: product.id,
            },
          },
        });

        if (!inventoryAfter) {
          throw new BadRequestException(
            "Inventory record missing after sale",
          );
        }

        movementSnapshots.push({
          productId: product.id,
          quantityBefore: inventoryBefore.quantity,
          quantityAfter: inventoryAfter.quantity,
        });

        calculatedItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          lineTotal,
        });
        subtotal = subtotal.add(lineTotal);
      }

      const discount = new Prisma.Decimal(dto.discount ?? 0);

      if (discount.greaterThan(subtotal)) {
        throw new BadRequestException("Discount cannot exceed subtotal");
      }

      const total = subtotal.sub(discount);
      const paymentTotal = dto.payments.reduce(
        (sum, payment) => sum.add(new Prisma.Decimal(payment.amount)),
        new Prisma.Decimal(0),
      );

      if (paymentTotal.lessThan(total)) {
        throw new BadRequestException(
          `Insufficient payment. Required: ${total.toFixed(2)}, received: ${paymentTotal.toFixed(2)}`,
        );
      }

      const saleNumber = await this.generateSaleNumber(tx);

      const sale = await tx.sale.create({
        data: {
          saleNumber,
          receiptNumber: saleNumber,
          tenantId: user.tenantId,
          branchId,
          cashierId: user.sub,
          shiftId: shift.id,
          customerId,
          subtotal,
          discountAmount: discount,
          totalAmount: total,
          amountPaid: paymentTotal,
          changeAmount: paymentTotal.sub(total),
          status: "COMPLETED",
          items: {
            create: calculatedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
          payments: {
            create: dto.payments.map((payment) => ({
              method: payment.method,
              amount: new Prisma.Decimal(payment.amount),
              reference: payment.reference,
            })),
          },
        },
        include: {
          branch: true,
          cashier: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          items: { include: { product: true } },
          payments: true,
        },
      });

      for (const item of calculatedItems) {
        const snapshot = movementSnapshots.find(
          (entry) => entry.productId === item.productId,
        );

        if (!snapshot) {
          throw new BadRequestException(
            "Inventory movement snapshot missing",
          );
        }

        await tx.inventoryMovement.create({
          data: {
            tenantId: user.tenantId,
            branchId: user.branchId!,
            productId: item.productId,
            type: "POS_SALE",
            quantity: item.quantity.neg(),
            quantityBefore: snapshot.quantityBefore,
            quantityAfter: snapshot.quantityAfter,
            referenceType: "SALE",
            referenceId: sale.id,
            referenceNumber: sale.saleNumber,
            createdById: user.sub,
          },
        });
      }

      const cashPaymentTotal =
        dto.payments
          .filter(
            (payment) =>
              payment.method === "CASH",
          )
          .reduce(
            (total, payment) =>
              total.add(
                new Prisma.Decimal(
                  payment.amount,
                ),
              ),
            new Prisma.Decimal(0),
          );

      const retainedCash =
        Prisma.Decimal.min(
          cashPaymentTotal,
          total,
        );

      if (
        retainedCash.greaterThan(0)
      ) {
        await tx.cashDrawerMovement.create({
          data: {
            tenantId: user.tenantId,
            branchId,
            shiftId: shift.id,
            userId: user.sub,
            type: "CASH_SALE",
            amount: retainedCash,
            reference: sale.saleNumber,
            notes:
              `Cash received for sale ${sale.saleNumber}`,
          },
        });
      }

      return {
        success: true,
        sale,
        paymentTotal,
        change: paymentTotal.sub(total),
      };
    });
  }

  async voidSale(
    saleId: string,
    reason: string,
    manager: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale =
          await tx.sale.findFirst({
            where: {
              id: saleId,
              tenantId:
                manager.tenantId,
            },

            include: {
              items: true,
              payments: true,
            },
          });

        if (!sale) {
          throw new NotFoundException(
            "Sale not found",
          );
        }

        if (
          sale.status !==
          "COMPLETED"
        ) {
          throw new BadRequestException(
            "Only completed sales can be voided",
          );
        }

        if (
          sale.voidedAt ||
          sale.voidedById
        ) {
          throw new BadRequestException(
            "Sale has already been voided",
          );
        }

        for (const item of sale.items) {
          const inventoryBefore =
            await tx.inventory.findUnique({
              where: {
                branchId_productId: {
                  branchId:
                    sale.branchId,
                  productId:
                    item.productId,
                },
              },
            });

          if (!inventoryBefore) {
            throw new BadRequestException(
              "Inventory record missing",
            );
          }

          await tx.inventory.update({
            where: {
              branchId_productId: {
                branchId:
                  sale.branchId,
                productId:
                  item.productId,
              },
            },
            data: {
              quantity: {
                increment:
                  item.quantity,
              },
            },
          });

          const inventoryAfter =
            await tx.inventory.findUnique({
              where: {
                branchId_productId: {
                  branchId:
                    sale.branchId,
                  productId:
                    item.productId,
                },
              },
            });

          if (!inventoryAfter) {
            throw new BadRequestException(
              "Inventory record missing after void",
            );
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId:
                sale.tenantId,
              branchId:
                sale.branchId,
              productId:
                item.productId,
              type:
                "SALE_VOID",
              quantity:
                new Prisma.Decimal(
                  item.quantity,
                ),
              quantityBefore:
                inventoryBefore.quantity,
              quantityAfter:
                inventoryAfter.quantity,
              referenceType:
                "SALE_VOID",
              referenceId:
                sale.id,
              referenceNumber:
                sale.saleNumber,
              notes:
                reason,
              createdById:
                manager.sub,
            },
          });
        }

        const cashPaid =
          sale.payments
            .filter(
              (payment) =>
                payment.method ===
                "CASH",
            )
            .reduce(
              (sum, payment) =>
                sum.add(
                  payment.amount,
                ),
              new Prisma.Decimal(
                0,
              ),
            );

        if (
          cashPaid.greaterThan(
            0,
          )
        ) {
          const shift =
            await tx.shift.findFirst({
              where: {
                id:
                  sale.shiftId ??
                  undefined,

                status:
                  "OPEN",
              },
            });

          if (!shift) {
            throw new BadRequestException(
              "Cash sale cannot be voided because its cashier shift is no longer open",
            );
          }

          const reversalAmount =
            Prisma.Decimal.min(
              cashPaid,
              sale.totalAmount,
            );

          await tx.cashDrawerMovement.create({
            data: {
              tenantId:
                sale.tenantId,

              branchId:
                sale.branchId,

              shiftId:
                shift.id,

              userId:
                manager.sub,

              type:
                "CASH_REFUND",

              amount:
                reversalAmount,

              reference:
                sale.saleNumber,

              notes:
                `VOID reversal for ${sale.saleNumber}: ${reason}`,
            },
          });
        }

        return tx.sale.update({
          where: {
            id:
              sale.id,
          },

          data: {
            status:
              "VOIDED",

            voidedById:
              manager.sub,

            voidReason:
              reason,

            voidedAt:
              new Date(),
          },

          include: {
            branch: true,

            cashier: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },

            voidedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },

            items: {
              include: {
                product: true,
              },
            },

            payments: true,
          },
        });
      },
    );
  }

  async findAll(user: AuthenticatedUser) {
    return this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        items: { include: { product: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async search(term: string, user: AuthenticatedUser) {
    const cleanTerm = term.trim();

    if (!cleanTerm) {
      return [];
    }

    return this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          {
            saleNumber: {
              contains: cleanTerm,
              mode: "insensitive",
            },
          },
          {
            receiptNumber: {
              contains: cleanTerm,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        items: { include: { product: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        items: {
          include: {
            product: true,
            returnItems: {
              include: {
                return: {
                  select: {
                    status: true,
                  },
                },
              },
            },
          },
        },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException("Sale not found");
    }

    return sale;
  }

  private async generateSaleNumber(tx: Prisma.TransactionClient) {
    const today = new Date();
    const date =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const random = Math.floor(100000 + Math.random() * 900000);

    return `SALE-${date}-${random}`;
  }
}
