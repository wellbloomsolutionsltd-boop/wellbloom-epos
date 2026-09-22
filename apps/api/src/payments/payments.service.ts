import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import {
  OrdersService,
} from "../orders/orders.service";
import {
  PosCheckoutsService,
} from "../pos-checkouts/pos-checkouts.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CardService,
} from "./card/card.service";
import {
  getCallbackValue,
} from "./mpesa/mpesa-callback";
import { MpesaService } from "./mpesa/mpesa.service";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,

    @Inject(MpesaService)
    private readonly mpesa:
      MpesaService,

    @Inject(OrdersService)
    private readonly ordersService:
      OrdersService,

    @Inject(PosCheckoutsService)
    private readonly posCheckoutsService:
      PosCheckoutsService,

    @Inject(CardService)
    private readonly cardService:
      CardService,
  ) {}

  async initiateBankPayment(
    orderId: string,
    reference: string | undefined,
    user: AuthenticatedUser,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id:
            orderId,

          tenantId:
            user.tenantId,

          status:
            "AWAITING_PAYMENT",
        },
      });

    if (!order) {
      throw new NotFoundException(
        "Order is not awaiting payment",
      );
    }

    return this.prisma
      .paymentTransaction
      .create({
        data: {
          transactionNumber:
            `PAY-${Date.now()}`,

          tenantId:
            order.tenantId,

          branchId:
            order.branchId,

          targetType:
            "ORDER",

          orderId:
            order.id,

          provider:
            "BANK",

          status:
            "PENDING",

          amount:
            order.total,

          currency:
            "KES",

          externalReference:
            reference,
        },
      });
  }

  async initiateOrderCard(
    orderId: string,
    user: AuthenticatedUser,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id:
            orderId,

          tenantId:
            user.tenantId,

          status:
            "AWAITING_PAYMENT",

          paymentStatus: {
            in: [
              "UNPAID",
              "PENDING",
            ],
          },
        },

        include: {
          customer: true,
        },
      });

    if (!order) {
      throw new NotFoundException(
        "Order is not awaiting payment",
      );
    }

    const existing =
      await this.prisma
        .paymentTransaction
        .findFirst({
          where: {
            orderId:
              order.id,

            provider:
              "CARD",

            status: {
              in: [
                "INITIATED",
                "PENDING",
                "VERIFYING",
              ],
            },
          },
        });

    if (existing) {
      throw new BadRequestException(
        "A card payment is already pending for this order",
      );
    }

    const transactionNumber =
      `PAY-${Date.now()}`;

    const payment =
      await this.prisma
        .paymentTransaction
        .create({
          data: {
            transactionNumber,

            tenantId:
              order.tenantId,

            branchId:
              order.branchId,

            targetType:
              "ORDER",

            orderId:
              order.id,

            provider:
              "CARD",

            status:
              "INITIATED",

            amount:
              order.total,

            currency:
              "KES",
          },
        });

    try {
      const providerResponse =
        await this.cardService
          .createPayment({
            amount:
              Number(
                order.total,
              ),

            currency:
              "KES",

            reference:
              order.orderNumber,

            customer:
              order.customer
                ? {
                    name:
                      `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim(),

                    email:
                      order.customer.email ??
                      undefined,

                    phone:
                      order.customer.phone ??
                      undefined,
                  }
                : undefined,
          });

      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "PENDING",

            providerRequestId:
              providerResponse
                .providerRequestId,

            rawResponse:
              providerResponse
                .rawResponse as any,
          },
        });

      return {
        transactionNumber,

        status:
          "PENDING",

        checkoutUrl:
          providerResponse
            .checkoutUrl,
      };
    } catch (error) {
      await this.prisma
        .paymentTransaction
        .update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "FAILED",

            failedAt:
              new Date(),

            failureReason:
              error instanceof Error
                ? error.message
                : "Card payment initiation failed",
          },
        });

      throw error;
    }
  }

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

    const existing =
      await this.prisma
        .paymentTransaction
        .findFirst({
          where: {
            orderId:
              order.id,

            provider:
              "MPESA",

            status: {
              in: [
                "INITIATED",
                "PENDING",
                "VERIFYING",
              ],
            },
          },

          orderBy: {
            createdAt:
              "desc",
          },
        });

    if (existing) {
      throw new BadRequestException(
        "An M-Pesa payment request is already pending for this order",
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

    await this.prisma.paymentTransaction.update({
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

    return {
      transactionNumber:
        payment.transactionNumber,
      status:
        "PENDING",
      message:
        "Check your phone to complete payment.",
    };
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
        transactionNumber:
          payment.transactionNumber,
        status:
          "PENDING",
        message:
          "Check your phone to complete payment.",
      };
    });
  }

  async getMpesaPaymentStatus(
    transactionNumber: string,
    user: AuthenticatedUser,
  ) {
    const payment =
      await this.prisma.paymentTransaction.findFirst({
        where: {
          transactionNumber,
          tenantId:
            user.tenantId,
          provider:
            "MPESA",
        },
        select: {
          transactionNumber: true,
          provider: true,
          status: true,
          amount: true,
          currency: true,
          externalReference: true,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        "M-Pesa payment not found",
      );
    }

    return {
      transactionNumber:
        payment.transactionNumber,
      provider:
        payment.provider,
      status:
        payment.status,
      amount:
        payment.amount.toFixed(2),
      currency:
        payment.currency,
      externalReference:
        payment.externalReference,
    };
  }

  async getPaymentReviewQueue(
    user: AuthenticatedUser,
  ) {
    const payments =
      await this.prisma.paymentTransaction.findMany({
        where: {
          tenantId:
            user.tenantId,
          status:
            "REQUIRES_REVIEW",
        },
        select: {
          transactionNumber: true,
          provider: true,
          targetType: true,
          status: true,
          amount: true,
          providerAmount: true,
          currency: true,
          externalReference: true,
          phone: true,
          providerPhone: true,
          failureCode: true,
          failureReason: true,
          callbackReceivedAt: true,
          verificationStartedAt: true,
          createdAt: true,
          updatedAt: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              paymentStatus: true,
            },
          },
          posCheckout: {
            select: {
              id: true,
              checkoutNumber: true,
              status: true,
            },
          },
        },
        orderBy: {
          updatedAt:
            "desc",
        },
      });

    return payments.map(
      (payment) => ({
        ...payment,
        amount:
          payment.amount.toFixed(2),
        providerAmount:
          payment.providerAmount
            ?.toFixed(2) ?? null,
      }),
    );
  }

  private async finalizeVerifiedCardPayment(
    paymentId: string,
    verification: {
      successful: boolean;
      amount?: number;
      externalReference?: string;
      rawResponse: unknown;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const payment =
          await tx.paymentTransaction
            .findUnique({
              where: {
                id:
                  paymentId,
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
          throw new NotFoundException(
            "Payment not found",
          );
        }

        if (
          payment.status ===
          "SUCCEEDED"
        ) {
          return {
            success: true,
          };
        }

        if (
          !verification.successful
        ) {
          await tx.paymentTransaction.update({
            where: {
              id:
                payment.id,
            },

            data: {
              status:
                "FAILED",

              failedAt:
                new Date(),

              rawVerification:
                verification
                  .rawResponse as any,
            },
          });

          return {
            success: false,
          };
        }

        const providerAmount =
          new Prisma.Decimal(
            verification.amount ??
              0,
          );

        if (
          !providerAmount.equals(
            payment.amount,
          )
        ) {
          await tx.paymentTransaction.update({
            where: {
              id:
                payment.id,
            },

            data: {
              status:
                "REQUIRES_REVIEW",

              providerAmount,

              failureReason:
                "Card payment amount mismatch",

              rawVerification:
                verification
                  .rawResponse as any,
            },
          });

          return {
            success: false,
            requiresReview:
              true,
          };
        }

        if (!payment.order) {
          throw new BadRequestException(
            "Card payment has no associated order",
          );
        }

        const activeReservations =
          payment.order
            .reservations
            .filter(
              (reservation) =>
                reservation.status ===
                "ACTIVE",
            );

        if (
          activeReservations.length ===
          0
        ) {
          await tx.paymentTransaction.update({
            where: {
              id:
                payment.id,
            },

            data: {
              status:
                "REQUIRES_REVIEW",

              externalReference:
                verification
                  .externalReference,

              providerAmount,

              failureReason:
                "Card payment succeeded after reservation expired or order became unavailable",

              rawVerification:
                verification
                  .rawResponse as any,
            },
          });

          return {
            success: true,
            requiresReview:
              true,
          };
        }

        await this.ordersService
          .confirmPaidOrderWithTx(
            tx,
            payment.order.id,
          );

        await tx.paymentTransaction.update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "SUCCEEDED",

            externalReference:
              verification
                .externalReference,

            providerAmount,

            completedAt:
              new Date(),

            rawVerification:
              verification
                .rawResponse as any,
          },
        });

        return {
          success: true,
        };
      },
    );
  }

  private async finalizeVerifiedMpesaPayment(
    paymentId: string,
    callbackEventId: string,
    verification: any,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const payment =
          await tx.paymentTransaction.findUnique({
            where: {
              id:
                paymentId,
            },

            include: {
              order: {
                include: {
                  reservations:
                    true,
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
            "Payment not found",
          );
        }

        if (
          payment.status ===
          "SUCCEEDED"
        ) {
          return {
            success:
              true,
          };
        }

        if (
          payment.status !==
          "VERIFYING"
        ) {
          return {
            success:
              false,
          };
        }

        if (payment.targetType === "POS_CHECKOUT") {
          if (!payment.posCheckout) {
            throw new BadRequestException(
              "M-Pesa payment has no POS checkout",
            );
          }

          if (
            payment.posCheckout.status !==
              "PAYMENT_PENDING" ||
            payment.posCheckout.reservations.length === 0
          ) {
            await tx.paymentTransaction.update({
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
                  "Payment received after POS checkout reservation expired or was released",
              },
            });

            await tx.paymentCallbackEvent.update({
              where: {
                id:
                  callbackEventId,
              },
              data: {
                processed:
                  true,
                processingResult:
                  "LATE_POS_PAYMENT_REQUIRES_REVIEW",
                processedAt:
                  new Date(),
              },
            });

            return {
              success:
                true,
              requiresReview:
                true,
            };
          }

          const sale =
            await this.posCheckoutsService
              .confirmPaidPosCheckoutWithTx(
                tx,
                payment.posCheckout.id,
                payment.id,
              );

          const completed =
            await tx.paymentTransaction.updateMany({
              where: {
                id:
                  payment.id,
                status:
                  "VERIFYING",
              },
              data: {
                status:
                  "SUCCEEDED",
                completedAt:
                  new Date(),
                saleId:
                  sale.id,
                rawVerification:
                  verification,
              },
            });

          if (completed.count !== 1) {
            throw new BadRequestException(
              "Payment was already finalized",
            );
          }

          await tx.paymentCallbackEvent.update({
            where: {
              id:
                callbackEventId,
            },
            data: {
              processed:
                true,
              processingResult:
                "POS_PAYMENT_CONFIRMED",
              processedAt:
                new Date(),
            },
          });

          return {
            success:
              true,
            saleId:
              sale.id,
          };
        }

        if (!payment.order) {
          throw new BadRequestException(
            "M-Pesa payment has no order",
          );
        }

        if (
          payment.order.status !==
          "AWAITING_PAYMENT"
        ) {
          await tx.paymentTransaction.update({
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
                "Payment received after order was no longer awaiting payment",
            },
          });

          await tx.paymentCallbackEvent.update({
            where: {
              id:
                callbackEventId,
            },

            data: {
              processed:
                true,

              processingResult:
                "ORDER_STATE_REQUIRES_REVIEW",

              processedAt:
                new Date(),
            },
          });

          return {
            success:
              true,

            requiresReview:
              true,
          };
        }

        /*
         * Check reservation state.
         */
        const activeReservations =
          payment.order
            .reservations
            .filter(
              (reservation) =>
                reservation.status ===
                "ACTIVE",
            );

        /*
         * Late payment:
         *
         * money arrived after reservation
         * was released or expired.
         */
        if (
          activeReservations.length ===
          0
        ) {
          await tx.paymentTransaction.update({
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
                "Payment received after inventory reservation expired or was released",
            },
          });

          await tx.paymentCallbackEvent.update({
            where: {
              id:
                callbackEventId,
            },

            data: {
              processed:
                true,

              processingResult:
                "LATE_PAYMENT_REQUIRES_REVIEW",

              processedAt:
                new Date(),
            },
          });

          return {
            success:
              true,

            requiresReview:
              true,
          };
        }

        /*
         * Complete order using the one
         * hardened inventory engine.
         */
        await this.ordersService
          .confirmPaidOrderWithTx(
            tx,
            payment.order.id,
          );

        /*
         * Claim payment exactly once.
         */
        const completed =
          await tx.paymentTransaction.updateMany({
            where: {
              id:
                payment.id,

              status:
                "VERIFYING",
            },

            data: {
              status:
                "SUCCEEDED",

              completedAt:
                new Date(),

              rawVerification:
                verification,
            },
          });

        if (
          completed.count !==
          1
        ) {
          throw new BadRequestException(
            "Payment was already finalized",
          );
        }

        await tx.paymentCallbackEvent.update({
          where: {
            id:
              callbackEventId,
          },

          data: {
            processed:
              true,

            processingResult:
              "PAYMENT_CONFIRMED",

            processedAt:
              new Date(),
          },
        });

        return {
          success:
            true,
        };
      },
    );
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
