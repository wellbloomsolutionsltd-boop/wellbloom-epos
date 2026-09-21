import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { OrdersService } from "../orders/orders.service";
import { PosCheckoutsService } from "../pos-checkouts/pos-checkouts.service";
import { PrismaService } from "../prisma/prisma.service";
import { MpesaService } from "./mpesa/mpesa.service";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,

    @Inject(MpesaService)
    private readonly mpesa: MpesaService,

    @Inject(OrdersService)
    private readonly ordersService: OrdersService,

    @Inject(PosCheckoutsService)
    private readonly posCheckoutsService: PosCheckoutsService,
  ) {}

  async initiateOrderMpesa(
    orderId: string,
    phoneInput: string,
    user: AuthenticatedUser,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId: user.tenantId,
        status: "AWAITING_PAYMENT",
        paymentStatus: {
          in: ["UNPAID", "PENDING"],
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        "Order is not awaiting payment",
      );
    }

    const existingPendingPayment =
      await this.prisma.paymentTransaction.findFirst({
        where: {
          orderId: order.id,
          provider: "MPESA",
          status: {
            in: ["INITIATED", "PENDING"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    if (existingPendingPayment) {
      throw new BadRequestException(
        "An M-Pesa payment is already pending for this order",
      );
    }

    const phone = this.mpesa.normalizePhone(phoneInput);

    const transactionNumber = `PAY-${Date.now()}`;
    const payment = await this.prisma.paymentTransaction.create({
      data: {
        transactionNumber,
        tenantId: order.tenantId,
        branchId: order.branchId,
        targetType: "ORDER",
        orderId: order.id,
        provider: "MPESA",
        status: "INITIATED",
        amount: order.total,
        currency: "KES",
        phone,
      },
    });

    let response;

    try {
      response = await this.mpesa.initiateStkPush({
        phone,
        amount: Number(order.total),
        accountReference: order.orderNumber,
        description: `Payment for ${order.orderNumber}`,
      });
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "FAILED",
          failureReason:
            error instanceof Error
              ? error.message
              : "M-Pesa request failed",
          failedAt: new Date(),
        },
      });

      throw error;
    }

    return this.prisma.paymentTransaction.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "PENDING",
        providerRequestId:
          response.MerchantRequestID,
        providerCheckoutId:
          response.CheckoutRequestID,
        rawResponse: response,
      },
    });
  }

  async initiatePosMpesa(
    posCheckoutId: string,
    phoneInput: string,
    user: AuthenticatedUser,
  ) {
    const checkout =
      await this.prisma.posCheckout.findFirst({
        where: {
          id: posCheckoutId,
          tenantId: user.tenantId,
          branchId: user.branchId ?? undefined,
          status: {
            in: [
              "AWAITING_PAYMENT",
              "PAYMENT_PENDING",
            ],
          },
        },
        include: {
          reservations: {
            where: {
              status: "ACTIVE",
            },
          },
        },
      });

    if (!checkout) {
      throw new NotFoundException(
        "POS checkout is not awaiting payment",
      );
    }

    if (
      checkout.reservationExpiresAt &&
      checkout.reservationExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        "POS checkout reservation has expired",
      );
    }

    const existingPending =
      await this.prisma.paymentTransaction.findFirst({
        where: {
          posCheckoutId: checkout.id,
          provider: "MPESA",
          status: {
            in: ["INITIATED", "PENDING"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    if (existingPending) {
      throw new BadRequestException(
        "An M-Pesa payment is already pending for this checkout",
      );
    }

    const phone = this.mpesa.normalizePhone(phoneInput);
    const transactionNumber = `POSPAY-${Date.now()}`;

    const payment =
      await this.prisma.paymentTransaction.create({
        data: {
          transactionNumber,
          tenantId: checkout.tenantId,
          branchId: checkout.branchId,
          targetType: "POS_CHECKOUT",
          posCheckoutId: checkout.id,
          provider: "MPESA",
          status: "INITIATED",
          amount: checkout.totalAmount,
          currency: "KES",
          phone,
        },
      });

    let response;

    try {
      response = await this.mpesa.initiateStkPush({
        phone,
        amount: Number(checkout.totalAmount),
        accountReference: checkout.checkoutNumber,
        description: `POS payment ${checkout.checkoutNumber}`,
      });
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason:
            error instanceof Error
              ? error.message
              : "M-Pesa request failed",
        },
      });

      throw error;
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedPayment =
        await tx.paymentTransaction.update({
          where: {
            id: payment.id,
          },
          data: {
            status: "PENDING",
            providerRequestId:
              response.MerchantRequestID,
            providerCheckoutId:
              response.CheckoutRequestID,
            rawResponse: response,
          },
        });

      await tx.posCheckout.update({
        where: {
          id: checkout.id,
        },
        data: {
          status: "PAYMENT_PENDING",
          paymentStartedAt: new Date(),
        },
      });

      return {
        success: true,
        payment: updatedPayment,
        checkout: {
          id: checkout.id,
          checkoutNumber:
            checkout.checkoutNumber,
          status: "PAYMENT_PENDING",
          totalAmount:
            checkout.totalAmount,
        },
      };
    });
  }

  async handleMpesaCallback(body: any) {
    const callback = body?.Body?.stkCallback;

    if (!callback) {
      throw new BadRequestException(
        "Invalid M-Pesa callback",
      );
    }

    const checkoutId = callback.CheckoutRequestID;

    if (!checkoutId) {
      throw new BadRequestException(
        "Missing CheckoutRequestID",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const payment =
          await tx.paymentTransaction.findFirst({
            where: {
              provider: "MPESA",
              providerCheckoutId:
                checkoutId,
            },
            include: {
              order: {
                include: {
                  reservations: {
                    where: {
                      status:
                        "ACTIVE",
                    },
                  },
                },
              },
              posCheckout: {
                include: {
                  reservations: {
                    where: {
                      status:
                        "ACTIVE",
                    },
                  },
                },
              },
            },
          });

        if (!payment) {
          throw new NotFoundException(
            "Payment transaction not found",
          );
        }

        if (payment.status === "SUCCEEDED") {
          return {
            success: true,
          };
        }

        const resultCode = Number(
          callback.ResultCode,
        );

        const metadataItems =
          callback.CallbackMetadata?.Item ?? [];
        const metadata = Object.fromEntries(
          metadataItems.map(
            (item: {
              Name: string;
              Value?: unknown;
            }) => [
              item.Name,
              item.Value,
            ],
          ),
        );
        const callbackAmount =
          metadata.Amount !== undefined
            ? new Prisma.Decimal(
                String(metadata.Amount),
              )
            : null;
        const mpesaReceipt =
          metadata.MpesaReceiptNumber
            ? String(metadata.MpesaReceiptNumber)
            : null;
        const callbackPhone =
          metadata.PhoneNumber
            ? String(metadata.PhoneNumber)
            : null;

        if (resultCode !== 0) {
          const now = new Date();

          await tx.paymentTransaction.update({
            where: {
              id: payment.id,
            },
            data: {
              status: "FAILED",
              failedAt: now,
              callbackReceivedAt: now,
              failureCode: String(resultCode),
              failureReason:
                callback.ResultDesc,
              rawCallback: body,
            },
          });

          const isCancellation =
            resultCode === 1032;
          const isExpiry =
            resultCode === 1037;

          if (
            payment.targetType ===
              "POS_CHECKOUT" &&
            payment.posCheckout
          ) {
            await tx.inventoryReservation.updateMany({
              where: {
                posCheckoutId:
                  payment.posCheckout.id,
                status: "ACTIVE",
              },
              data: {
                status: isExpiry
                  ? "EXPIRED"
                  : "RELEASED",
                releasedAt: now,
                expiredAt: isExpiry
                  ? now
                  : undefined,
              },
            });

            await tx.posCheckout.update({
              where: {
                id:
                  payment.posCheckout.id,
              },
              data: {
                status: isExpiry
                  ? "EXPIRED"
                  : isCancellation
                    ? "CANCELLED"
                    : "FAILED",
                cancelledAt:
                  isCancellation
                    ? now
                    : undefined,
                failedAt:
                  isCancellation || isExpiry
                    ? undefined
                    : now,
              },
            });
          }

          return {
            success: true,
          };
        }

        if (!callbackAmount) {
          throw new BadRequestException(
            "Successful M-Pesa callback has no amount",
          );
        }

        if (!callbackAmount.equals(payment.amount)) {
          throw new BadRequestException(
            "M-Pesa callback amount mismatch",
          );
        }

        await tx.paymentTransaction.update({
          where: {
            id: payment.id,
          },
          data: {
            providerAmount: callbackAmount,
            providerPhone: callbackPhone,
            externalReference: mpesaReceipt,
            callbackReceivedAt: new Date(),
            rawCallback: body,
          },
        });

        if (payment.targetType === "POS_CHECKOUT") {
          if (!payment.posCheckout) {
            throw new BadRequestException(
              "POS payment has no associated checkout",
            );
          }

          const sale =
            await this.posCheckoutsService
              .confirmPaidPosCheckoutWithTx(
                tx,
                payment.posCheckout.id,
                payment.id,
              );

          await tx.paymentTransaction.update({
            where: {
              id: payment.id,
            },
            data: {
              status: "SUCCEEDED",
              completedAt: new Date(),
              saleId: sale.id,
            },
          });

          return {
            success: true,
            saleId: sale.id,
          };
        }

        if (!payment.order) {
          throw new BadRequestException(
            "Payment has no associated order",
          );
        }

        await this.ordersService.confirmPaidOrderWithTx(
          tx,
          payment.order.id,
        );

        await tx.paymentTransaction.update({
          where: {
            id: payment.id,
          },
          data: {
            status: "SUCCEEDED",
            completedAt: new Date(),
          },
        });

        return {
          success: true,
        };
      },
    );
  }
}
