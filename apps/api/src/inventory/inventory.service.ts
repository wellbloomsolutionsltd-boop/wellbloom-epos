import {
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";

import {
  InventoryMovementType,
  Prisma,
} from "@prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  AuthenticatedUser,
} from "../auth/jwt-auth.guard";

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

  async recordMovement(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      branchId: string;
      productId: string;
      type: InventoryMovementType;
      quantity: Prisma.Decimal;
      quantityBefore: Prisma.Decimal;
      quantityAfter: Prisma.Decimal;
      referenceType?: string;
      referenceId?: string;
      referenceNumber?: string;
      notes?: string;
      createdById?: string;
    },
  ) {
    return tx.inventoryMovement.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId,
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        quantityBefore: data.quantityBefore,
        quantityAfter: data.quantityAfter,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        createdById: data.createdById,
      },
    });
  }

  async getProductAvailability(
    productId: string,
    branchId: string,
  ) {
    const inventory =
      await this.prisma.inventory.findUnique({
        where: {
          branchId_productId: {
            branchId,
            productId,
          },
        },
        include: {
          product: true,
          branch: true,
        },
      });

    if (!inventory) {
      throw new NotFoundException(
        "Inventory record not found",
      );
    }

    const quantity =
      new Prisma.Decimal(
        inventory.quantity,
      );

    const reservedQty =
      new Prisma.Decimal(
        inventory.reservedQty,
      );

    const availableQty =
      quantity.sub(
        reservedQty,
      );

    return {
      ...inventory,
      availableQty,
    };
  }

  async getProductMovements(
    productId: string,
    user: AuthenticatedUser,
  ) {
    const product =
      await this.prisma.product.findFirst({
        where: {
          id: productId,
          tenantId: user.tenantId,
        },
      });

    if (!product) {
      throw new NotFoundException(
        "Product not found",
      );
    }

    return this.prisma.inventoryMovement.findMany({
      where: {
        tenantId: user.tenantId,
        productId,
        ...(user.branchId
          ? {
              branchId: user.branchId,
            }
          : {}),
      },
      include: {
        branch: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });
  }
}
