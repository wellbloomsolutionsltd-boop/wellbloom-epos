import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async findByEmail(
    tenantId: string,
    email: string,
  ) {
    return this.prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: email.toLowerCase(),
        },
      },

      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async findById(id: string) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id,
        },

        include: {
          tenant: true,
          branch: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        "User not found",
      );
    }

    return user;
  }

  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        tenantId: true,
        branchId: true,
        branch: true,
        createdAt: true,
        updatedAt: true,
      },

      orderBy: {
        firstName: "asc",
      },
    });
  }
}
