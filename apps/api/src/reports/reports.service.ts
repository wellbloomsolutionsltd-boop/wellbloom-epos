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

  private resolveDateRange(
    startDate?: string,
    endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date();
    const end = endDate
      ? new Date(endDate)
      : new Date();

    if (!startDate) {
      start.setHours(0, 0, 0, 0);
    }

    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private branchFilter(
    user: AuthenticatedUser,
    branchId?: string,
  ) {
    return branchId ?? user.branchId ?? undefined;
  }

  async getSalesByPeriod(
    user: AuthenticatedUser,
    startDate?: string,
    endDate?: string,
    branchId?: string,
  ) {
    const { start, end } =
      this.resolveDateRange(startDate, endDate);
    const scopedBranch = this.branchFilter(user, branchId);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        branchId: scopedBranch,
        status: "COMPLETED",
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
    });
    const dailyMap = new Map<string, {
      date: string;
      transactions: number;
      grossSales: number;
      discounts: number;
      netSales: number;
    }>();

    for (const sale of sales) {
      const date = sale.createdAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(date) ?? {
        date,
        transactions: 0,
        grossSales: 0,
        discounts: 0,
        netSales: 0,
      };
      existing.transactions++;
      existing.grossSales += Number(sale.subtotal);
      existing.discounts += Number(sale.discountAmount);
      existing.netSales += Number(sale.totalAmount);
      dailyMap.set(date, existing);
    }

    return Array.from(dailyMap.values());
  }

  async getMonthlySales(
    user: AuthenticatedUser,
    year: number,
    branchId?: string,
  ) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        branchId: this.branchFilter(user, branchId),
        status: "COMPLETED",
        createdAt: { gte: start, lte: end },
      },
    });
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      transactions: 0,
      sales: 0,
    }));
    for (const sale of sales) {
      const month = months[sale.createdAt.getMonth()];
      month.transactions++;
      month.sales += Number(sale.totalAmount);
    }
    return months;
  }

  async getSalesByBranch(
    user: AuthenticatedUser,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.resolveDateRange(startDate, endDate);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        status: "COMPLETED",
        createdAt: { gte: start, lte: end },
      },
      include: { branch: true },
    });
    const map = new Map<string, {
      branchId: string;
      branchName: string;
      transactions: number;
      sales: number;
    }>();
    for (const sale of sales) {
      const existing = map.get(sale.branchId) ?? {
        branchId: sale.branchId,
        branchName: sale.branch.name,
        transactions: 0,
        sales: 0,
      };
      existing.transactions++;
      existing.sales += Number(sale.totalAmount);
      map.set(sale.branchId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }

  async getSalesByProduct(
    user: AuthenticatedUser,
    startDate?: string,
    endDate?: string,
    branchId?: string,
  ) {
    const { start, end } = this.resolveDateRange(startDate, endDate);
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          tenantId: user.tenantId,
          branchId: this.branchFilter(user, branchId),
          status: "COMPLETED",
          createdAt: { gte: start, lte: end },
        },
      },
      include: { product: true },
    });
    const map = new Map<string, {
      productId: string;
      product: string;
      quantity: number;
      revenue: number;
      cost: number;
      grossProfit: number;
      grossMarginPercent: number;
    }>();
    for (const item of items) {
      const quantity = Number(item.quantity);
      const revenue = Number(item.lineTotal);
      const cost = Number(item.product.costPrice ?? 0) * quantity;
      const existing = map.get(item.productId) ?? {
        productId: item.productId,
        product: item.product.name,
        quantity: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
      };
      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.grossProfit += revenue - cost;
      existing.grossMarginPercent = existing.revenue > 0
        ? (existing.grossProfit / existing.revenue) * 100
        : 0;
      map.set(item.productId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  async getStockValuation(user: AuthenticatedUser) {
    const inventory = await this.prisma.inventory.findMany({
      where: {
        branch: { tenantId: user.tenantId },
        branchId: this.branchFilter(user),
      },
      include: { product: true, branch: true },
    });
    let costValue = 0;
    let retailValue = 0;
    const items = inventory.map((record) => {
      const quantity = Number(record.quantity);
      const unitCost = Number(record.product.costPrice ?? 0);
      const sellingPrice = Number(record.product.sellingPrice);
      const costValueForItem = quantity * unitCost;
      const retailValueForItem = quantity * sellingPrice;
      costValue += costValueForItem;
      retailValue += retailValueForItem;
      return {
        productId: record.productId,
        product: record.product.name,
        branch: record.branch.name,
        quantity,
        unitCost,
        sellingPrice,
        costValue: costValueForItem,
        retailValue: retailValueForItem,
      };
    });
    return {
      costValue,
      retailValue,
      potentialGrossProfit: retailValue - costValue,
      items,
    };
  }

  async getPaymentReconciliation(
    user: AuthenticatedUser,
  ) {
    const payments =
      await this.prisma.paymentTransaction.findMany({
        where: {
          tenantId:
            user.tenantId,
          ...(user.branchId
            ? {
                branchId:
                  user.branchId,
              }
            : {}),
        },
        select: {
          transactionNumber: true,
          provider: true,
          targetType: true,
          status: true,
          amount: true,
          providerAmount: true,
          currency: true,
          externalReference: true,
          providerRequestId: true,
          providerCheckoutId: true,
          failureCode: true,
          failureReason: true,
          callbackReceivedAt: true,
          completedAt: true,
          createdAt: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              status: true,
              paymentStatus: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              status: true,
            },
          },
          posCheckout: {
            select: {
              id: true,
              checkoutNumber: true,
              totalAmount: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt:
            "desc",
        },
        take: 500,
      });

    return payments.map((payment) => ({
      ...payment,
      amount:
        payment.amount.toFixed(2),
      providerAmount:
        payment.providerAmount
          ?.toFixed(2) ?? null,
    }));
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
