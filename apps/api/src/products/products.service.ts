import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import {
  getBranchScope,
} from "../common/authorization/branch-access";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async findAll(user: AuthenticatedUser) {
    const branchId = getBranchScope(user);
    return this.prisma.product.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
      },

      include: {
        inventory: {
          where: {
            branchId,
          },
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

  async findByBarcode(
    barcode: string,
    user: AuthenticatedUser,
  ) {
    const branchId = getBranchScope(user);
    const product = await this.prisma.product.findFirst({
      where: {
        barcode,
        tenantId: user.tenantId,
        isActive: true,
      },

      include: {
        inventory: {
          where: {
            branchId,
          },
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
