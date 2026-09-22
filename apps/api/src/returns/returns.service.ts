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
import { AuditService } from "../audit/audit.service";

import {
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

import {
  CreateReturnDto,
} from "./dto/create-return.dto";

import {
  ReviewReturnDto,
} from "./dto/review-return.dto";

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
    @Inject(AuditService)
    private readonly auditService:
      AuditService,
  ) {}

  async requestReturn(
    dto: CreateReturnDto,
    user: AuthenticatedUser,
  ) {
    if (!user.branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const sale =
      await this.prisma.sale.findFirst({
        where: {
          id:
            dto.saleId,
          tenantId:
            user.tenantId,
          branchId:
            user.branchId,
          status:
            "COMPLETED",
        },
        include: {
          items: {
            include: {
              returnItems: {
                include: {
                  return: true,
                },
              },
            },
          },
        },
      });

    if (!sale) {
      throw new NotFoundException(
        "Completed sale not found",
      );
    }

    let refundAmount =
      new Prisma.Decimal(0);

    const calculatedItems: {
      saleItemId: string;
      productId: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      refundAmount: Prisma.Decimal;
    }[] = [];

    for (const requested of dto.items) {
      const saleItem =
        sale.items.find(
          (item) =>
            item.id ===
            requested.saleItemId,
        );

      if (!saleItem) {
        throw new BadRequestException(
          "Return item does not belong to this sale",
        );
      }

      const previouslyReturned =
        saleItem.returnItems
          .filter(
            (item) =>
              item.return.status ===
                "COMPLETED" ||
              item.return.status ===
                "APPROVED",
          )
          .reduce(
            (sum, item) =>
              sum.add(item.quantity),
            new Prisma.Decimal(0),
          );

      const availableToReturn =
        new Prisma.Decimal(
          saleItem.quantity,
        ).sub(previouslyReturned);

      const returnQuantity =
        new Prisma.Decimal(
          requested.quantity,
        );

      if (
        returnQuantity.greaterThan(
          availableToReturn,
        )
      ) {
        throw new BadRequestException(
          "Return quantity exceeds remaining returnable quantity",
        );
      }

      const itemRefund =
        returnQuantity.mul(
          saleItem.unitPrice,
        );

      refundAmount =
        refundAmount.add(itemRefund);

      calculatedItems.push({
        saleItemId:
          saleItem.id,
        productId:
          saleItem.productId,
        quantity:
          returnQuantity,
        unitPrice:
          saleItem.unitPrice,
        refundAmount:
          itemRefund,
      });
    }

    const returnNumber =
      `RET-${Date.now()}`;

    return this.prisma.return.create({
      data: {
        returnNumber,
        tenantId:
          user.tenantId,
        branchId:
          user.branchId,
        saleId:
          sale.id,
        requestedById:
          user.sub,
        reason:
          dto.reason,
        refundMethod:
          dto.refundMethod,
        refundAmount,
        status:
          "PENDING",
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
        sale: true,
        requestedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async reviewReturn(
    returnId: string,
    dto: ReviewReturnDto,
    manager: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const returnRecord =
          await tx.return.findFirst({
            where: {
              id:
                returnId,

              tenantId:
                manager.tenantId,

              status:
                "PENDING",
            },

            include: {
              items: true,
              sale: true,
            },
          });

        if (!returnRecord) {
          throw new NotFoundException(
            "Pending return not found",
          );
        }

        if (
          returnRecord.requestedById ===
          manager.sub
        ) {
          throw new BadRequestException(
            "You cannot approve your own return request",
          );
        }

        if (
          dto.decision ===
          "REJECTED"
        ) {
          return tx.return.update({
            where: {
              id:
                returnRecord.id,
            },

            data: {
              status:
                "REJECTED",

              approvedById:
                manager.sub,

              approvedAt:
                new Date(),
            },
          });
        }

        for (
          const item
          of returnRecord.items
        ) {
          const inventoryBefore =
            await tx.inventory.findUnique({
              where: {
                branchId_productId: {
                  branchId:
                    returnRecord.branchId,
                  productId:
                    item.productId,
                },
              },
            });

          if (!inventoryBefore) {
            throw new BadRequestException(
              "Inventory record not found",
            );
          }

          await tx.inventory.update({
            where: {
              branchId_productId: {
                branchId:
                  returnRecord.branchId,
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
                    returnRecord.branchId,
                  productId:
                    item.productId,
                },
              },
            });

          if (!inventoryAfter) {
            throw new BadRequestException(
              "Inventory record missing after return",
            );
          }

          await tx.inventoryMovement.create({
            data: {
              tenantId:
                returnRecord.tenantId,
              branchId:
                returnRecord.branchId,
              productId:
                item.productId,
              type:
                "SALE_RETURN",
              quantity:
                new Prisma.Decimal(
                  item.quantity,
                ),
              quantityBefore:
                inventoryBefore.quantity,
              quantityAfter:
                inventoryAfter.quantity,
              referenceType:
                "RETURN",
              referenceId:
                returnRecord.id,
              referenceNumber:
                returnRecord.returnNumber,
              createdById:
                manager.sub,
            },
          });
        }

        if (
          returnRecord.refundMethod ===
          "CASH"
        ) {
          const shift =
            await tx.shift.findFirst({
              where: {
                tenantId:
                  manager.tenantId,

                branchId:
                  returnRecord.branchId,

                userId:
                  returnRecord.requestedById,

                status:
                  "OPEN",
              },
            });

          if (!shift) {
            throw new BadRequestException(
              "Cash refund requires an open cashier shift",
            );
          }

          await tx.cashDrawerMovement.create({
            data: {
              tenantId:
                returnRecord.tenantId,

              branchId:
                returnRecord.branchId,

              shiftId:
                shift.id,

              userId:
                returnRecord.requestedById,

              type:
                "CASH_REFUND",

              amount:
                returnRecord.refundAmount,

              reference:
                returnRecord.returnNumber,

              notes:
                `Return ${returnRecord.returnNumber}`,
            },
          });
        }

        const completed =
          await tx.return.update({
            where: {
              id:
                returnRecord.id,
            },

            data: {
              status:
                "COMPLETED",

              approvedById:
                manager.sub,

              approvedAt:
                new Date(),

              completedAt:
                new Date(),
            },

            include: {
              sale: true,

              items: {
                include: {
                  product: true,
                },
              },

              requestedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },

              approvedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          });

        const originalSale =
          await tx.sale.findUnique({
            where: {
              id:
                returnRecord.saleId,
            },

            include: {
              items: {
                include: {
                  returnItems: {
                    include: {
                      return: true,
                    },
                  },
                },
              },
            },
          });

        if (originalSale) {
          const fullyReturned =
            originalSale.items.every(
              (saleItem) => {
                const returned =
                  saleItem.returnItems
                    .filter(
                      (returnItem) =>
                        returnItem.return
                          .status ===
                        "COMPLETED",
                    )
                    .reduce(
                      (sum, returnItem) =>
                        sum.add(
                          returnItem.quantity,
                        ),
                      new Prisma.Decimal(
                        0,
                      ),
                    );

                return returned.greaterThanOrEqualTo(
                  saleItem.quantity,
                );
              },
            );

          if (fullyReturned) {
            await tx.sale.update({
              where: {
                id:
                  originalSale.id,
              },

              data: {
                status:
                  "REFUNDED",
              },
            });
          }
        }

        await this.auditService.createWithTx(
          tx,
          {
            tenantId: returnRecord.tenantId,
            userId: manager.sub,
            action: "RETURN_APPROVED",
            entityType: "RETURN",
            entityId: returnRecord.id,
            metadata: {
              returnNumber:
                returnRecord.returnNumber,
              refundAmount:
                returnRecord.refundAmount.toString(),
              refundMethod:
                returnRecord.refundMethod,
            },
          },
        );

        return completed;
      },
    );
  }

  async findAll(
    user: AuthenticatedUser,
  ) {
    return this.prisma.return.findMany({
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

      include: {
        sale: true,

        items: {
          include: {
            product: true,
          },
        },

        requestedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },

        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },

      orderBy: {
        createdAt:
          "desc",
      },
    });
  }
}
