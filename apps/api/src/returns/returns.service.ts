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
}
