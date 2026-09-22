import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PriceChannel,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SetProductPriceDto } from "./dto/set-product-price.dto";

@Injectable()
export class PricingService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async resolveProductPrice(params: {
    tenantId: string;
    productId: string;
    branchId?: string | null;
    channel: PriceChannel;
    at?: Date;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;
    const now = params.at ?? new Date();

    const product = await db.product.findFirst({
      where: {
        id: params.productId,
        tenantId: params.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const activeDateFilter = {
      AND: [
        {
          OR: [
            { startsAt: null },
            { startsAt: { lte: now } },
          ],
        },
        {
          OR: [
            { endsAt: null },
            { endsAt: { gt: now } },
          ],
        },
      ],
    };

    if (params.branchId) {
      const branchPrice = await db.productPrice.findFirst({
        where: {
          tenantId: params.tenantId,
          productId: params.productId,
          branchId: params.branchId,
          channel: params.channel,
          isActive: true,
          ...activeDateFilter,
        },
        orderBy: [
          { startsAt: "desc" },
          { createdAt: "desc" },
        ],
      });

      if (branchPrice) {
        return {
          price: branchPrice.price,
          source: "BRANCH_CHANNEL_PRICE" as const,
          priceId: branchPrice.id,
        };
      }
    }

    const channelPrice = await db.productPrice.findFirst({
      where: {
        tenantId: params.tenantId,
        productId: params.productId,
        branchId: null,
        channel: params.channel,
        isActive: true,
        ...activeDateFilter,
      },
      orderBy: [
        { startsAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (channelPrice) {
      return {
        price: channelPrice.price,
        source: "CHANNEL_PRICE" as const,
        priceId: channelPrice.id,
      };
    }

    return {
      price: product.sellingPrice,
      source: "PRODUCT_DEFAULT" as const,
      priceId: null,
    };
  }

  async setProductPrice(
    dto: SetProductPriceDto,
    tenantId: string,
    actorUserId?: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId,
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          tenantId,
        },
      });

      if (!branch) {
        throw new NotFoundException("Branch not found");
      }
    }

    if (
      dto.startsAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    ) {
      throw new BadRequestException(
        "endsAt must be later than startsAt",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const price = await tx.productPrice.create({
        data: {
          tenantId,
          productId: dto.productId,
          branchId: dto.branchId,
          channel: dto.channel,
          price: new Prisma.Decimal(dto.price),
          startsAt: dto.startsAt
            ? new Date(dto.startsAt)
            : null,
          endsAt: dto.endsAt
            ? new Date(dto.endsAt)
            : null,
        },
      });

      await this.auditService.createWithTx(tx, {
        tenantId,
        userId: actorUserId,
        action: "PRODUCT_PRICE_CHANGED",
        entityType: "PRODUCT_PRICE",
        entityId: price.id,
        metadata: {
          productId: dto.productId,
          branchId: dto.branchId ?? null,
          channel: dto.channel,
          price: price.price.toString(),
        },
      });

      return price;
    });
  }
}
