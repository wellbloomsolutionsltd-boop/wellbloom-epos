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
import {
  getCallbackValue,
} from "./mpesa/mpesa-callback";
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

  private async finalizeVerifiedMpesaPayment(
    paymentId: string,
    callbackEventId: string,
    verification: any,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const payment =
            await tx.paymentTransaction.findUnique({
              where: {
                id: paymentId,
              },
              include: {
                order: true,
                posCheckout: true,
              },
            });

          if (!payment) {
            throw new BadRequestException(
              "Payment transaction not found",
            );
          }

          if (payment.status === "SUCCEEDED") {
            await tx.paymentCallbackEvent.update({
              where: {
                id: callbackEventId,
              },
              data: {
                processed: true,
                processingResult:
                  "DUPLICATE_SUCCESS",
                processedAt: new Date(),
              },
            });

            return {
              ResultCode: 0,
              ResultDesc: "Accepted",
            };
          }

          if (payment.status !== "VERIFYING") {
            await tx.paymentCallbackEvent.update({
              where: {
                id: callbackEventId,
              },
              data: {
                processed: true,
                processingResult:
                  "PAYMENT_NOT_VERIFYING",
                processedAt: new Date(),
              },
            });

            return {
              ResultCode: 0,
              ResultDesc: "Accepted",
            };
          }

          let saleId: string | undefined;

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

            saleId = sale.id;
          } else if (payment.targetType === "ORDER") {
            if (!payment.order) {
              throw new BadRequestException(
                "Payment has no associated order",
              );
            }

            await this.ordersService
              .confirmPaidOrderWithTx(
                tx,
                payment.order.id,
              );
          } else {
            throw new BadRequestException(
              "Unsupported M-Pesa payment target",
            );
          }

          const completed =
            await tx.paymentTransaction.updateMany({
              where: {
                id: payment.id,
                status: "VERIFYING",
              },
              data: {
                status: "SUCCEEDED",
                completedAt: new Date(),
                rawVerification: verification,
                saleId,
              },
            });

          if (completed.count !== 1) {
            throw new BadRequestException(
              "Payment has already been processed",
            );
          }

          await tx.paymentCallbackEvent.update({
            where: {
              id: callbackEventId,
            },
            data: {
              processed: true,
              processingResult:
                "PAYMENT_VERIFIED",
              processedAt: new Date(),
            },
          });

          return {
            ResultCode: 0,
            ResultDesc: "Accepted",
          };
        },
      );
    } catch (error) {
      const failureReason =
        error instanceof Error
          ? error.message
          : "Verified payment could not be finalized";

      await this.prisma.$transaction(
        async (tx) => {
          await tx.paymentTransaction.updateMany({
            where: {
              id: paymentId,
              status: "VERIFYING",
            },
            data: {
              status: "REQUIRES_REVIEW",
              rawVerification: verification,
              failureReason,
            },
          });

          await tx.paymentCallbackEvent.update({
            where: {
              id: callbackEventId,
            },
            data: {
              processed: true,
              processingResult:
                "FINALIZATION_FAILED",
              processedAt: new Date(),
            },
          });
        },
      );

      return {
        ResultCode: 0,
        ResultDesc: "Accepted",
      };
    }
  }

  async handleMpesaCallback(
    body: any,
  ) {
    const callback =
      body?.Body?.stkCallback;

    /*
     * Always store callback evidence first.
     */
    const checkoutId =
      callback?.CheckoutRequestID
        ? String(
            callback.CheckoutRequestID,
          )
        : null;

    const callbackEvent =
      await this.prisma
        .paymentCallbackEvent
        .create({
          data: {
            provider:
              "MPESA",

            providerCheckoutId:
              checkoutId,

            payload:
              body,
          },
        });

    if (
      !callback ||
      !checkoutId
    ) {
      await this.prisma
        .paymentCallbackEvent
        .update({
          where: {
            id:
              callbackEvent.id,
          },

          data: {
            processed:
              true,

            processingResult:
              "INVALID_CALLBACK",

            processedAt:
              new Date(),
          },
        });

      /*
       * Provider callbacks should normally
       * receive a successful HTTP response
       * even when we cannot process the
       * business event, otherwise repeated
       * retries may become noisy.
       */
      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    const payment =
      await this.prisma
        .paymentTransaction
        .findUnique({
          where: {
            providerCheckoutId:
              checkoutId,
          },

          include: {
            order: {
              include: {
                reservations:
                  true,
              },
            },
          },
        });

    if (!payment) {
      await this.prisma
        .paymentCallbackEvent
        .update({
          where: {
            id:
              callbackEvent.id,
          },

          data: {
            processed:
              true,

            processingResult:
              "UNKNOWN_CHECKOUT_ID",

            processedAt:
              new Date(),
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * Idempotent duplicate success.
     */
    if (
      payment.status ===
      "SUCCEEDED"
    ) {
      await this.prisma
        .paymentCallbackEvent
        .update({
          where: {
            id:
              callbackEvent.id,
          },

          data: {
            processed:
              true,

            processingResult:
              "DUPLICATE_SUCCESS",

            processedAt:
              new Date(),
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    const resultCode =
      Number(
        callback.ResultCode,
      );

    /*
     * Failed / cancelled STK attempt.
     */
    if (
      resultCode !== 0
    ) {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.paymentTransaction.updateMany({
            where: {
              id:
                payment.id,

              status: {
                in: [
                  "INITIATED",
                  "PENDING",
                  "VERIFYING",
                ],
              },
            },

            data: {
              status:
                "FAILED",

              failedAt:
                new Date(),

              callbackReceivedAt:
                new Date(),

              failureCode:
                String(
                  resultCode,
                ),

              failureReason:
                String(
                  callback.ResultDesc ??
                    "M-Pesa payment failed",
                ),

              rawCallback:
                body,
            },
          });

          await tx.paymentCallbackEvent.update({
            where: {
              id:
                callbackEvent.id,
            },

            data: {
              processed:
                true,

              processingResult:
                "PAYMENT_FAILED",

              processedAt:
                new Date(),
            },
          });
        },
      );

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * Successful callback must contain
     * metadata.
     */
    const items =
      callback
        ?.CallbackMetadata
        ?.Item as
        | {
            Name?: string;
            Value?: string | number;
          }[]
        | undefined;

    const amountRaw =
      getCallbackValue(
        items,
        "Amount",
      );

    const receiptRaw =
      getCallbackValue(
        items,
        "MpesaReceiptNumber",
      );

    const phoneRaw =
      getCallbackValue(
        items,
        "PhoneNumber",
      );

    const dateRaw =
      getCallbackValue(
        items,
        "TransactionDate",
      );

    const providerAmount =
      new Prisma.Decimal(
        String(
          amountRaw ?? 0,
        ),
      );

    const receipt =
      receiptRaw
        ? String(receiptRaw)
        : null;

    const providerPhone =
      phoneRaw
        ? String(phoneRaw)
        : null;

    if (
      !receipt ||
      providerAmount.lte(0)
    ) {
      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "REQUIRES_REVIEW",

            callbackReceivedAt:
              new Date(),

            rawCallback:
              body,

            failureReason:
              "Successful callback missing required payment metadata",
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * Critical amount validation.
     */
    if (
      !providerAmount.equals(
        payment.amount,
      )
    ) {
      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "REQUIRES_REVIEW",

            providerAmount,

            externalReference:
              receipt,

            providerPhone,

            callbackReceivedAt:
              new Date(),

            rawCallback:
              body,

            failureReason:
              "Amount mismatch. Expected " +
              payment.amount.toString() +
              ", received " +
              providerAmount.toString(),
          },
        });

      await this.prisma
        .paymentCallbackEvent
        .update({
          where: {
            id:
              callbackEvent.id,
          },

          data: {
            processed:
              true,

            processingResult:
              "AMOUNT_MISMATCH",

            processedAt:
              new Date(),
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * Mark VERIFYING before provider query.
     */
    const claimed =
      await this.prisma
        .paymentTransaction
        .updateMany({
          where: {
            id:
              payment.id,

            status: {
              in: [
                "INITIATED",
                "PENDING",
              ],
            },
          },

          data: {
            status:
              "VERIFYING",

            callbackReceivedAt:
              new Date(),

            verificationStartedAt:
              new Date(),

            providerAmount,

            externalReference:
              receipt,

            providerPhone,

            rawCallback:
              body,
          },
        });

    if (
      claimed.count !== 1
    ) {
      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * Query provider from our server.
     */
    let verification: any;

    try {
      verification =
        await this.mpesa.queryStkPush(
          checkoutId,
        );
    } catch {
      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "REQUIRES_REVIEW",

            failureReason:
              "M-Pesa callback received but provider verification could not be completed",
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    /*
     * In Daraja STK-query responses,
     * ResultCode 0 indicates successful
     * completion.
     *
     * Do not fulfil when provider query
     * reports another state.
     */
    if (
      Number(
        verification?.ResultCode,
      ) !== 0
    ) {
      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "REQUIRES_REVIEW",

            rawVerification:
              verification,

            failureReason:
              "Callback and M-Pesa transaction verification do not agree",
          },
        });

      return {
        ResultCode: 0,
        ResultDesc:
          "Accepted",
      };
    }

    return this.finalizeVerifiedMpesaPayment(
      payment.id,
      callbackEvent.id,
      verification,
    );
  }
}
