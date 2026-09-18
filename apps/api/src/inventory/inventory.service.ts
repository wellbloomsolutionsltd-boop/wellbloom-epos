import {
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";

import {
  Prisma,
} from "@prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,
  ) {}

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
}
