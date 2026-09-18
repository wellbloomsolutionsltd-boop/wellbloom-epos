import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async createSale(
    dto: CreateSaleDto,
    user: AuthenticatedUser,
  ) {
    const branchId = user.branchId;

    if (!branchId) {
      throw new BadRequestException(
        "User is not assigned to a branch",
      );
    }

    const shift = await this.prisma.shift.findFirst({
      where: {
        tenantId: user.tenantId,
        branchId,
        userId: user.sub,
        status: "OPEN",
      },
    });

    if (!shift) {
      throw new BadRequestException(
        "You must open a cashier shift before making sales",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: {
          id: branchId,
          tenantId: user.tenantId,
        },
      });

      if (!branch) {
        throw new NotFoundException(
          "Branch was not found for this tenant",
        );
      }

      const calculatedItems: {
        productId: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }[] = [];

      let subtotal = new Prisma.Decimal(0);

      for (const requestedItem of dto.items) {
        const product = await tx.product.findFirst({
          where: {
            id: requestedItem.productId,
            tenantId: user.tenantId,
            isActive: true,
          },
        });

        if (!product) {
          throw new NotFoundException(
            `Product ${requestedItem.productId} was not found`,
          );
        }

        const quantity = new Prisma.Decimal(
          requestedItem.quantity,
        );
        const unitPrice = new Prisma.Decimal(product.sellingPrice);
        const lineTotal = unitPrice.mul(quantity);

        const stockUpdate = await tx.inventory.updateMany({
          where: {
            branchId,
            productId: product.id,
            quantity: { gte: quantity },
          },
          data: {
            quantity: { decrement: quantity },
          },
        });

        if (stockUpdate.count !== 1) {
          const inventory = await tx.inventory.findUnique({
            where: {
              branchId_productId: {
                branchId,
                productId: product.id,
              },
            },
          });

          const available = inventory?.quantity?.toString() ?? "0";

          throw new BadRequestException(
            `Insufficient stock for ${product.name}. Available: ${available}`,
          );
        }

        calculatedItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          lineTotal,
        });
        subtotal = subtotal.add(lineTotal);
      }

      const discount = new Prisma.Decimal(dto.discount ?? 0);

      if (discount.greaterThan(subtotal)) {
        throw new BadRequestException("Discount cannot exceed subtotal");
      }

      const total = subtotal.sub(discount);
      const paymentTotal = dto.payments.reduce(
        (sum, payment) => sum.add(new Prisma.Decimal(payment.amount)),
        new Prisma.Decimal(0),
      );

      if (paymentTotal.lessThan(total)) {
        throw new BadRequestException(
          `Insufficient payment. Required: ${total.toFixed(2)}, received: ${paymentTotal.toFixed(2)}`,
        );
      }

      const saleNumber = await this.generateSaleNumber(tx);

      const sale = await tx.sale.create({
        data: {
          saleNumber,
          receiptNumber: saleNumber,
          tenantId: user.tenantId,
          branchId,
          cashierId: user.sub,
          shiftId: shift.id,
          subtotal,
          discountAmount: discount,
          totalAmount: total,
          amountPaid: paymentTotal,
          changeAmount: paymentTotal.sub(total),
          status: "COMPLETED",
          items: {
            create: calculatedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
          payments: {
            create: dto.payments.map((payment) => ({
              method: payment.method,
              amount: new Prisma.Decimal(payment.amount),
              reference: payment.reference,
            })),
          },
        },
        include: {
          branch: true,
          cashier: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          items: { include: { product: true } },
          payments: true,
        },
      });

      const cashPaymentTotal =
        dto.payments
          .filter(
            (payment) =>
              payment.method === "CASH",
          )
          .reduce(
            (total, payment) =>
              total.add(
                new Prisma.Decimal(
                  payment.amount,
                ),
              ),
            new Prisma.Decimal(0),
          );

      const retainedCash =
        Prisma.Decimal.min(
          cashPaymentTotal,
          total,
        );

      if (
        retainedCash.greaterThan(0)
      ) {
        await tx.cashDrawerMovement.create({
          data: {
            tenantId: user.tenantId,
            branchId,
            shiftId: shift.id,
            userId: user.sub,
            type: "CASH_SALE",
            amount: retainedCash,
            reference: sale.saleNumber,
            notes:
              `Cash received for sale ${sale.saleNumber}`,
          },
        });
      }

      return {
        success: true,
        sale,
        paymentTotal,
        change: paymentTotal.sub(total),
      };
    });
  }

  async findAll(user: AuthenticatedUser) {
    return this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        items: { include: { product: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async search(term: string, user: AuthenticatedUser) {
    const cleanTerm = term.trim();

    if (!cleanTerm) {
      return [];
    }

    return this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          {
            saleNumber: {
              contains: cleanTerm,
              mode: "insensitive",
            },
          },
          {
            receiptNumber: {
              contains: cleanTerm,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        items: { include: { product: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        branch: true,
        cashier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        items: { include: { product: true } },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException("Sale not found");
    }

    return sale;
  }

  private async generateSaleNumber(tx: Prisma.TransactionClient) {
    const today = new Date();
    const date =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const random = Math.floor(100000 + Math.random() * 900000);

    return `SALE-${date}-${random}`;
  }
}
