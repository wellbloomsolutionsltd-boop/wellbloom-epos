import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  PaymentMethod,
  Prisma,
} from "@prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

import {
  CloseEndOfDayDto,
} from "./dto/close-end-of-day.dto";

@Injectable()
export class EndOfDayService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  private getBusinessDayRange(
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

  private formatOpenShiftError(
    count: number,
  ) {
    return `End of Day cannot be completed. ${count} cashier shift${count === 1 ? " is" : "s are"} still open.`;
  }

  async getCurrentSummary(
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
    } = this.getBusinessDayRange();

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
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: {
          openedAt: "asc",
        },
      });

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
          status: {
            in: [
              "COMPLETED",
              "REFUNDED",
              "VOIDED",
            ],
          },
        },
        include: {
          payments: true,
        },
      });

    let grossSales =
      new Prisma.Decimal(0);
    let totalDiscount =
      new Prisma.Decimal(0);
    let totalReturns =
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
    let transactionCount = 0;

    for (const sale of sales) {
      if (sale.status === "COMPLETED") {
        grossSales =
          grossSales.add(
            sale.subtotal,
          );
        totalDiscount =
          totalDiscount.add(
            sale.discountAmount,
          );
        transactionCount++;

        for (const payment of sale.payments) {
          switch (payment.method) {
            case PaymentMethod.CASH:
              cashTotal =
                cashTotal.add(
                  payment.amount,
                );
              break;
            case PaymentMethod.MPESA:
              mpesaTotal =
                mpesaTotal.add(
                  payment.amount,
                );
              break;
            case PaymentMethod.CARD:
              cardTotal =
                cardTotal.add(
                  payment.amount,
                );
              break;
            case PaymentMethod.BANK:
              bankTotal =
                bankTotal.add(
                  payment.amount,
                );
              break;
            case PaymentMethod.INSURANCE:
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

      if (sale.status === "REFUNDED") {
        totalReturns =
          totalReturns.add(
            sale.totalAmount,
          );
      }
    }

    const netSales =
      grossSales
        .sub(totalDiscount)
        .sub(totalReturns);

    const totalCashVariance =
      shifts.reduce(
        (total, shift) =>
          total.add(
            shift.cashDifference ??
              0,
          ),
        new Prisma.Decimal(0),
      );

    const openShiftCount =
      shifts.filter(
        (shift) =>
          shift.status === "OPEN",
      ).length;

    return {
      businessDate: start,
      branchId: user.branchId,
      grossSales,
      totalDiscount,
      totalReturns,
      netSales,
      cashTotal,
      mpesaTotal,
      cardTotal,
      bankTotal,
      insuranceTotal,
      otherTotal,
      transactionCount,
      shiftCount: shifts.length,
      openShiftCount,
      totalCashVariance,
      shifts,
    };
  }

  async closeEndOfDay(
    dto: CloseEndOfDayDto,
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const summary =
      await this.getCurrentSummary(user);

    if (summary.openShiftCount > 0) {
      throw new BadRequestException(
        this.formatOpenShiftError(
          summary.openShiftCount,
        ),
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const openShiftCount =
          await tx.shift.count({
            where: {
              tenantId:
                user.tenantId,
              branchId:
                user.branchId!,
              openedAt: {
                gte: this.getBusinessDayRange(
                  summary.businessDate,
                ).start,
                lt: this.getBusinessDayRange(
                  summary.businessDate,
                ).end,
              },
              status: "OPEN",
            },
          });

        if (openShiftCount > 0) {
          throw new BadRequestException(
            this.formatOpenShiftError(
              openShiftCount,
            ),
          );
        }

        const existing =
          await tx.endOfDay.findUnique({
            where: {
              tenantId_branchId_businessDate: {
                tenantId:
                  user.tenantId,
                branchId:
                  user.branchId!,
                businessDate:
                  summary.businessDate,
              },
            },
          });

        if (existing?.status === "CLOSED") {
          throw new BadRequestException(
            "End of Day has already been closed for this branch",
          );
        }

        return tx.endOfDay.upsert({
          where: {
            tenantId_branchId_businessDate: {
              tenantId:
                user.tenantId,
              branchId:
                user.branchId!,
              businessDate:
                summary.businessDate,
            },
          },
          update: {
            status: "CLOSED",
            totalSales:
              summary.grossSales,
            totalDiscount:
              summary.totalDiscount,
            totalReturns:
              summary.totalReturns,
            netSales:
              summary.netSales,
            cashTotal:
              summary.cashTotal,
            mpesaTotal:
              summary.mpesaTotal,
            cardTotal:
              summary.cardTotal,
            bankTotal:
              summary.bankTotal,
            insuranceTotal:
              summary.insuranceTotal,
            otherTotal:
              summary.otherTotal,
            transactionCount:
              summary.transactionCount,
            shiftCount:
              summary.shiftCount,
            totalCashVariance:
              summary.totalCashVariance,
            closedById: user.sub,
            closedAt: new Date(),
            notes: dto.notes,
          },
          create: {
            businessDate:
              summary.businessDate,
            tenantId:
              user.tenantId,
            branchId:
              user.branchId!,
            status: "CLOSED",
            totalSales:
              summary.grossSales,
            totalDiscount:
              summary.totalDiscount,
            totalReturns:
              summary.totalReturns,
            netSales:
              summary.netSales,
            cashTotal:
              summary.cashTotal,
            mpesaTotal:
              summary.mpesaTotal,
            cardTotal:
              summary.cardTotal,
            bankTotal:
              summary.bankTotal,
            insuranceTotal:
              summary.insuranceTotal,
            otherTotal:
              summary.otherTotal,
            transactionCount:
              summary.transactionCount,
            shiftCount:
              summary.shiftCount,
            totalCashVariance:
              summary.totalCashVariance,
            closedById: user.sub,
            closedAt: new Date(),
            notes: dto.notes,
          },
          include: {
            branch: true,
            closedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        });
      },
    );
  }

  async getHistory(
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    return this.prisma.endOfDay.findMany({
      where: {
        tenantId:
          user.tenantId,
        branchId:
          user.branchId,
      },
      include: {
        branch: true,
        closedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        businessDate: "desc",
      },
      take: 100,
    });
  }
}
