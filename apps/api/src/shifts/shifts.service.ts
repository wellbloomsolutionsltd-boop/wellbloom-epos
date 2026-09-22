import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

import {
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

import {
  OpenShiftDto,
} from "./dto/open-shift.dto";

import {
  CloseShiftDto,
} from "./dto/close-shift.dto";

import {
  CashMovementRequestDto,
} from "./dto/cash-movement-request.dto";

import {
  ReviewCashMovementDto,
} from "./dto/review-cash-movement.dto";

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getCurrentShift(
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    return this.prisma.shift.findFirst({
      where: {
        tenantId: user.tenantId,
        branchId: user.branchId,
        userId: user.sub,
        status: "OPEN",
      },

      include: {
        branch: true,

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
        openedAt: "desc",
      },
    });
  }

  async openShift(
    dto: OpenShiftDto,
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const existing =
      await this.getCurrentShift(user);

    if (existing) {
      throw new BadRequestException(
        "You already have an open shift",
      );
    }

    const shiftNumber =
      this.generateShiftNumber();

    return this.prisma.$transaction(
      async (tx) => {
        const shift =
          await tx.shift.create({
            data: {
              shiftNumber,

              tenantId:
                user.tenantId,

              branchId:
                user.branchId!,

              userId:
                user.sub,

              openingCash:
                new Prisma.Decimal(
                  dto.openingCash,
                ),

              notes:
                dto.notes,

              status:
                "OPEN",
            },
          });

        await tx.cashDrawerMovement.create({
          data: {
            tenantId:
              user.tenantId,

            branchId:
              user.branchId!,

            shiftId:
              shift.id,

            userId:
              user.sub,

            type:
              "OPENING_FLOAT",

            amount:
              new Prisma.Decimal(
                dto.openingCash,
              ),

            notes:
              "Shift opening float",
          },
        });

        await this.auditService.createWithTx(
          tx,
          {
            tenantId: user.tenantId,
            userId: user.sub,
            action: "SHIFT_OPENED",
            entityType: "SHIFT",
            entityId: shift.id,
          },
        );

        return tx.shift.findUnique({
          where: {
            id: shift.id,
          },

          include: {
            branch: true,

            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },

            cashMovements: true,
          },
        });
      },
    );
  }

  async requestCashMovement(
    dto: CashMovementRequestDto,
    user: AuthenticatedUser,
  ) {
    const shift =
      await this.getCurrentShift(user);

    if (!shift) {
      throw new BadRequestException(
        "You must have an open shift",
      );
    }

    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    return this.prisma.cashMovementRequest.create({
      data: {
        tenantId:
          user.tenantId,

        branchId:
          user.branchId,

        shiftId:
          shift.id,

        requestedById:
          user.sub,

        type:
          dto.type,

        amount:
          new Prisma.Decimal(
            dto.amount,
          ),

        reason:
          dto.reason,

        reference:
          dto.reference,

        status:
          "PENDING",
      },
    });
  }

  async reviewCashMovement(
    requestId: string,
    dto: ReviewCashMovementDto,
    manager: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const request =
          await tx.cashMovementRequest.findFirst({
            where: {
              id:
                requestId,

              tenantId:
                manager.tenantId,

              status:
                "PENDING",
            },
          });

        if (!request) {
          throw new NotFoundException(
            "Pending cash movement request not found",
          );
        }

        if (
          request.requestedById ===
          manager.sub
        ) {
          throw new BadRequestException(
            "You cannot approve your own cash movement request",
          );
        }

        if (
          dto.decision ===
          "REJECTED"
        ) {
          return tx.cashMovementRequest.update({
            where: {
              id:
                request.id,
            },

            data: {
              status:
                "REJECTED",

              approvedById:
                manager.sub,

              reviewedAt:
                new Date(),

              reviewNotes:
                dto.notes,
            },
          });
        }

        const shift =
          await tx.shift.findUnique({
            where: {
              id:
                request.shiftId,
            },
          });

        if (
          !shift ||
          shift.status !==
            "OPEN"
        ) {
          throw new BadRequestException(
            "The associated shift is no longer open",
          );
        }

        const movement =
          await tx.cashDrawerMovement.create({
            data: {
              tenantId:
                request.tenantId,

              branchId:
                request.branchId,

              shiftId:
                request.shiftId,

              userId:
                request.requestedById,

              type:
                request.type,

              amount:
                request.amount,

              reference:
                request.reference,

              notes:
                `${request.reason} | Approved by ${manager.email}`,
            },
          });

        const reviewed =
          await tx.cashMovementRequest.update({
          where: {
            id:
              request.id,
          },

          data: {
            status:
              "APPROVED",

            approvedById:
              manager.sub,

            reviewedAt:
              new Date(),

            reviewNotes:
              dto.notes,

            movementId:
              movement.id,
          },

          include: {
            movement: true,
          },
          });

        await this.auditService.createWithTx(
          tx,
          {
            tenantId: request.tenantId,
            userId: manager.sub,
            action: "CASH_MOVEMENT_APPROVED",
            entityType: "CASH_MOVEMENT_REQUEST",
            entityId: request.id,
            metadata: {
              movementId: movement.id,
              type: request.type,
              amount: request.amount.toString(),
            },
          },
        );

        return reviewed;
      },
    );
  }

  async getShiftSummary(
    user: AuthenticatedUser,
  ) {
    const shift =
      await this.getCurrentShift(
        user,
      );

    if (!shift) {
      throw new NotFoundException(
        "No open shift found",
      );
    }

    const movements =
      await this.prisma.cashDrawerMovement.findMany({
        where: {
          shiftId:
            shift.id,
        },

        orderBy: {
          createdAt:
            "asc",
        },
      });

    const totals = {
      openingFloat:
        new Prisma.Decimal(0),

      cashSales:
        new Prisma.Decimal(0),

      cashRefunds:
        new Prisma.Decimal(0),

      cashIn:
        new Prisma.Decimal(0),

      cashOut:
        new Prisma.Decimal(0),

      bankDrops:
        new Prisma.Decimal(0),
    };

    for (const movement of movements) {
      const amount =
        new Prisma.Decimal(
          movement.amount,
        );

      switch (movement.type) {
        case "OPENING_FLOAT":
          totals.openingFloat =
            totals.openingFloat.add(
              amount,
            );

          break;

        case "CASH_SALE":
          totals.cashSales =
            totals.cashSales.add(
              amount,
            );

          break;

        case "CASH_REFUND":
          totals.cashRefunds =
            totals.cashRefunds.add(
              amount,
            );

          break;

        case "CASH_IN":
          totals.cashIn =
            totals.cashIn.add(
              amount,
            );

          break;

        case "CASH_OUT":
          totals.cashOut =
            totals.cashOut.add(
              amount,
            );

          break;

        case "BANK_DROP":
          totals.bankDrops =
            totals.bankDrops.add(
              amount,
            );

          break;
      }
    }

    return {
      shift,

      totals: {
        openingFloat:
          totals.openingFloat,

        cashSales:
          totals.cashSales,

        cashRefunds:
          totals.cashRefunds,

        cashIn:
          totals.cashIn,

        cashOut:
          totals.cashOut,

        bankDrops:
          totals.bankDrops,
      },

      movements,
    };
  }

  async closeShift(
    dto: CloseShiftDto,
    user: AuthenticatedUser,
  ) {
    const shift =
      await this.getCurrentShift(user);

    if (!shift) {
      throw new NotFoundException(
        "No open shift was found",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const lockedShift =
          await tx.shift.findUnique({
            where: {
              id:
                shift.id,
            },
          });

        if (
          !lockedShift ||
          lockedShift.status !==
            "OPEN"
        ) {
          throw new BadRequestException(
            "Shift has already been closed",
          );
        }

        const movements =
          await tx.cashDrawerMovement.findMany({
            where: {
              shiftId:
                shift.id,
            },
          });

        let expectedCash =
          new Prisma.Decimal(0);

        for (const movement of movements) {
          const amount =
            new Prisma.Decimal(
              movement.amount,
            );

          switch (movement.type) {
            case "OPENING_FLOAT":
            case "CASH_SALE":
            case "CASH_IN":
              expectedCash =
                expectedCash.add(
                  amount,
                );

              break;

            case "CASH_REFUND":
            case "CASH_OUT":
            case "BANK_DROP":
              expectedCash =
                expectedCash.sub(
                  amount,
                );

              break;

            case "CLOSING_COUNT":
              break;
          }
        }

        const countedCash =
          new Prisma.Decimal(
            dto.countedCash,
          );

        const cashDifference =
          countedCash.sub(
            expectedCash,
          );

        await tx.cashDrawerMovement.create({
          data: {
            tenantId:
              user.tenantId,

            branchId:
              user.branchId!,

            shiftId:
              shift.id,

            userId:
              user.sub,

            type:
              "CLOSING_COUNT",

            amount:
              countedCash,

            notes:
              "Physical cash counted at shift close",
          },
        });

        const closedShift =
          await tx.shift.update({
          where: {
            id: shift.id,
          },

          data: {
            status:
              "CLOSED",

            expectedCash,

            countedCash,

            cashDifference,

            closedAt:
              new Date(),

            notes:
              dto.notes ??
              shift.notes,
          },

          include: {
            branch: true,

            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },

            sales: {
              include: {
                payments: true,
              },
            },

            cashMovements: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          });

        await this.auditService.createWithTx(
          tx,
          {
            tenantId: user.tenantId,
            userId: user.sub,
            action: "SHIFT_CLOSED",
            entityType: "SHIFT",
            entityId: shift.id,
            metadata: {
              cashDifference:
                cashDifference.toString(),
            },
          },
        );

        return closedShift;
      },
    );
  }

  async getMyShiftHistory(
    user: AuthenticatedUser,
  ) {
    return this.prisma.shift.findMany({
      where: {
        tenantId:
          user.tenantId,

        userId:
          user.sub,
      },

      include: {
        branch: true,

        _count: {
          select: {
            sales: true,
          },
        },
      },

      orderBy: {
        openedAt: "desc",
      },

      take: 100,
    });
  }

  private generateShiftNumber() {
    const now =
      new Date();

    const date =
      now
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");

    const random =
      Math.floor(
        100000 +
          Math.random() * 900000,
      );

    return `SHIFT-${date}-${random}`;
  }
}
