import {
  BadRequestException,
  Inject,
  Injectable,
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

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

  private getDateRange(
    date = new Date(),
  ) {
    const start =
      new Date(date);

    start.setHours(
      0,
      0,
      0,
      0,
    );

    const end =
      new Date(start);

    end.setDate(
      end.getDate() + 1,
    );

    return {
      start,
      end,
    };
  }

  async getTodayDashboard(
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const {
      start,
      end,
    } = this.getDateRange();

    const sales =
      await this.prisma.sale.findMany({
        where: {
          tenantId:
            user.tenantId,
          branchId:
            user.branchId,
          createdAt: {
            gte: start,
            lt: end,
          },
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
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
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

    const returns =
      await this.prisma.return.findMany({
        where: {
          tenantId:
            user.tenantId,
          branchId:
            user.branchId,
          status:
            "COMPLETED",
          completedAt: {
            gte: start,
            lt: end,
          },
        },
      });

    const shifts =
      await this.prisma.shift.findMany({
        where: {
          tenantId:
            user.tenantId,
          branchId:
            user.branchId,
          openedAt: {
            gte: start,
            lt: end,
          },
        },
      });

    let grossSales =
      new Prisma.Decimal(0);
    let discounts =
      new Prisma.Decimal(0);
    let netCompletedSales =
      new Prisma.Decimal(0);
    let voidedSales =
      new Prisma.Decimal(0);
    let returnTotal =
      new Prisma.Decimal(0);
    let cashTotal =
      new Prisma.Decimal(0);
    let mpesaTotal =
      new Prisma.Decimal(0);
    let cardTotal =
      new Prisma.Decimal(0);
    let bankTotal =
      new Prisma.Decimal(0);
    let insuranceTotal =
      new Prisma.Decimal(0);
    let otherTotal =
      new Prisma.Decimal(0);
    let completedCount = 0;
    let voidCount = 0;
    let customerSales = 0;

    const cashierMap =
      new Map<
        string,
        {
          cashierId: string;
          name: string;
          transactions: number;
          sales: Prisma.Decimal;
        }
      >();

    const productMap =
      new Map<
        string,
        {
          productId: string;
          name: string;
          quantity: Prisma.Decimal;
          revenue: Prisma.Decimal;
        }
      >();

    for (const sale of sales) {
      if (sale.status === "COMPLETED") {
        completedCount++;

        grossSales =
          grossSales.add(
            sale.subtotal,
          );

        discounts =
          discounts.add(
            sale.discountAmount,
          );

        netCompletedSales =
          netCompletedSales.add(
            sale.totalAmount,
          );

        if (sale.customerId) {
          customerSales++;
        }

        if (sale.cashier) {
          const existing =
            cashierMap.get(
              sale.cashier.id,
            );

          if (existing) {
            existing.transactions++;
            existing.sales =
              existing.sales.add(
                sale.totalAmount,
              );
          } else {
            cashierMap.set(
              sale.cashier.id,
              {
                cashierId:
                  sale.cashier.id,
                name:
                  `${sale.cashier.firstName} ${sale.cashier.lastName}`,
                transactions: 1,
                sales:
                  new Prisma.Decimal(
                    sale.totalAmount,
                  ),
              },
            );
          }
        }

        for (const item of sale.items) {
          const existing =
            productMap.get(
              item.productId,
            );

          if (existing) {
            existing.quantity =
              existing.quantity.add(
                item.quantity,
              );
            existing.revenue =
              existing.revenue.add(
                item.lineTotal,
              );
          } else {
            productMap.set(
              item.productId,
              {
                productId:
                  item.productId,
                name:
                  item.product.name,
                quantity:
                  new Prisma.Decimal(
                    item.quantity,
                  ),
                revenue:
                  new Prisma.Decimal(
                    item.lineTotal,
                  ),
              },
            );
          }
        }

        for (const payment of sale.payments) {
          switch (payment.method) {
            case "CASH":
              cashTotal =
                cashTotal.add(
                  payment.amount,
                );
              break;
            case "MPESA":
              mpesaTotal =
                mpesaTotal.add(
                  payment.amount,
                );
              break;
            case "CARD":
              cardTotal =
                cardTotal.add(
                  payment.amount,
                );
              break;
            case "BANK":
              bankTotal =
                bankTotal.add(
                  payment.amount,
                );
              break;
            case "INSURANCE":
              insuranceTotal =
                insuranceTotal.add(
                  payment.amount,
                );
              break;
            default:
              otherTotal =
                otherTotal.add(
                  payment.amount,
                );
          }
        }
      }

      if (sale.status === "VOIDED") {
        voidCount++;
        voidedSales =
          voidedSales.add(
            sale.totalAmount,
          );
      }
    }

    for (const returnRecord of returns) {
      returnTotal =
        returnTotal.add(
          returnRecord.refundAmount,
        );
    }

    const adjustedNetSales =
      netCompletedSales.sub(
        returnTotal,
      );

    const averageTransaction =
      completedCount > 0
        ? adjustedNetSales.div(
            completedCount,
          )
        : new Prisma.Decimal(0);

    const cashVariance =
      shifts.reduce(
        (total, shift) =>
          total.add(
            shift.cashDifference ??
              0,
          ),
        new Prisma.Decimal(0),
      );

    const cashierSales =
      Array.from(
        cashierMap.values(),
      ).sort(
        (a, b) =>
          Number(b.sales) -
          Number(a.sales),
      );

    const topProducts =
      Array.from(
        productMap.values(),
      )
        .sort(
          (a, b) =>
            Number(b.quantity) -
            Number(a.quantity),
        )
        .slice(0, 10);

    return {
      period: {
        start,
        end,
      },
      summary: {
        grossSales,
        discounts,
        netSales:
          adjustedNetSales,
        completedTransactions:
          completedCount,
        averageTransaction,
        returns:
          returnTotal,
        returnCount:
          returns.length,
        voidedSales,
        voidCount,
        cashVariance,
        customerLinkedSales:
          customerSales,
        walkInSales:
          completedCount -
          customerSales,
      },
      payments: {
        cash: cashTotal,
        mpesa: mpesaTotal,
        card: cardTotal,
        bank: bankTotal,
        insurance: insuranceTotal,
        other: otherTotal,
      },
      shifts: {
        total:
          shifts.length,
        open:
          shifts.filter(
            (shift) =>
              shift.status ===
              "OPEN",
          ).length,
        closed:
          shifts.filter(
            (shift) =>
              shift.status ===
              "CLOSED",
          ).length,
      },
      cashierSales,
      topProducts,
    };
  }
}
