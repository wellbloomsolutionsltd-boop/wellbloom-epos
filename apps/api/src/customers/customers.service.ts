import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto, user: AuthenticatedUser) {
    const phone = dto.phone?.trim() || null;
    const email = dto.email?.trim().toLowerCase() || null;

    if (!phone && !email) {
      throw new BadRequestException(
        "Provide at least a phone number or email address",
      );
    }

    await this.ensureContactIsAvailable(user.tenantId, phone, email);

    return this.prisma.customer.create({
      data: {
        tenantId: user.tenantId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone,
        email,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async findAll(user: AuthenticatedUser) {
    return this.prisma.customer.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 200,
    });
  }

  async search(term: string, user: AuthenticatedUser) {
    const clean = term.trim();

    if (!clean) {
      return [];
    }

    return this.prisma.customer.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        OR: [
          {
            firstName: {
              contains: clean,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: clean,
              mode: "insensitive",
            },
          },
          {
            phone: {
              contains: clean,
            },
          },
          {
            email: {
              contains: clean,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 50,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        sales: {
          include: {
            branch: true,
            payments: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    user: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const phone =
      dto.phone === undefined ? undefined : dto.phone.trim() || null;
    const email =
      dto.email === undefined
        ? undefined
        : dto.email.trim().toLowerCase() || null;

    await this.ensureContactIsAvailable(
      user.tenantId,
      phone,
      email,
      customer.id,
    );

    try {
      return await this.prisma.customer.update({
        where: {
          id,
        },
        data: {
          firstName: dto.firstName?.trim(),
          lastName:
            dto.lastName === undefined
              ? undefined
              : dto.lastName.trim() || null,
          phone,
          email,
          notes:
            dto.notes === undefined
              ? undefined
              : dto.notes.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BadRequestException(
          "A customer with this phone number or email already exists",
        );
      }

      throw error;
    }
  }

  private async ensureContactIsAvailable(
    tenantId: string,
    phone: string | null | undefined,
    email: string | null | undefined,
    excludeCustomerId?: string,
  ) {
    if (!phone && !email) {
      return;
    }

    const existing = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        id: excludeCustomerId
          ? {
              not: excludeCustomerId,
            }
          : undefined,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existing?.phone === phone) {
      throw new BadRequestException(
        "A customer with this phone number already exists",
      );
    }

    if (existing?.email === email) {
      throw new BadRequestException(
        "A customer with this email already exists",
      );
    }
  }
}
