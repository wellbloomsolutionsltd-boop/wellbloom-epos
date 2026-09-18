import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async findAll() {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
      },

      include: {
        inventory: {
          include: {
            branch: true,
          },
        },
      },

      orderBy: {
        name: "asc",
      },
    });
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        barcode,
        isActive: true,
      },

      include: {
        inventory: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with barcode ${barcode} was not found`,
      );
    }

    return product;
  }
}
