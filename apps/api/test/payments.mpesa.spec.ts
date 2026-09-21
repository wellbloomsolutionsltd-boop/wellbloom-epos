import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { OrdersService } from "../src/orders/orders.service";
import { PaymentsService } from "../src/payments/payments.service";

type HarnessOptions = {
  amount?: string;
  orderStatus?: string;
  paymentStatus?: string;
  reservationStatus?: string;
  verificationFails?: boolean;
  verificationResultCode?: number;
};

function createHarness(
  options: HarnessOptions = {},
) {
  const events: any[] = [];
  const movements: any[] = [];

  const state: any = {
    payment: {
      id: "payment-1",
      transactionNumber: "PAY-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      targetType: "ORDER",
      orderId: "order-1",
      provider: "MPESA",
      providerCheckoutId: "checkout-1",
      status: options.paymentStatus ?? "PENDING",
      amount: new Prisma.Decimal(
        options.amount ?? "5000.00",
      ),
      currency: "KES",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    order: {
      id: "order-1",
      orderNumber: "WB-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      status:
        options.orderStatus ??
        "AWAITING_PAYMENT",
      paymentStatus: "PENDING",
      items: [
        {
          id: "item-1",
          productId: "product-1",
          quantity: new Prisma.Decimal(4),
        },
      ],
    },
    reservation: {
      id: "reservation-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      productId: "product-1",
      orderId: "order-1",
      quantity: new Prisma.Decimal(4),
      status:
        options.reservationStatus ?? "ACTIVE",
    },
    inventory: {
      branchId: "branch-1",
      productId: "product-1",
      quantity: new Prisma.Decimal(10),
      reservedQty: new Prisma.Decimal(4),
    },
    stockDeductions: 0,
    orderClaims: 0,
    queryCalls: 0,
    stkPushCalls: 0,
  };

  const relatedPayment = () => {
    if (!state.payment) {
      return null;
    }

    return {
      ...state.payment,
      order: state.payment.orderId
        ? {
            ...state.order,
            reservations: [
              {
                ...state.reservation,
              },
            ],
          }
        : null,
    };
  };

  const statusMatches = (
    actual: string,
    expected: any,
  ) => {
    if (!expected) {
      return true;
    }

    if (typeof expected === "string") {
      return actual === expected;
    }

    if (expected.in) {
      return expected.in.includes(actual);
    }

    return true;
  };

  const prisma: any = {
    paymentTransaction: {
      findUnique: async ({ where }: any) => {
        if (!state.payment) {
          return null;
        }

        if (
          where.id &&
          where.id !== state.payment.id
        ) {
          return null;
        }

        if (
          where.providerCheckoutId &&
          where.providerCheckoutId !==
            state.payment.providerCheckoutId
        ) {
          return null;
        }

        return relatedPayment();
      },
      findFirst: async ({ where }: any) => {
        if (!state.payment) {
          return null;
        }

        if (
          where.orderId &&
          where.orderId !== state.payment.orderId
        ) {
          return null;
        }

        if (
          !statusMatches(
            state.payment.status,
            where.status,
          )
        ) {
          return null;
        }

        return relatedPayment();
      },
      create: async ({ data }: any) => {
        state.payment = {
          id: "payment-created",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        return relatedPayment();
      },
      update: async ({ where, data }: any) => {
        assert.equal(
          where.id,
          state.payment.id,
        );
        Object.assign(state.payment, data, {
          updatedAt: new Date(),
        });
        return relatedPayment();
      },
      updateMany: async ({ where, data }: any) => {
        if (
          !state.payment ||
          where.id !== state.payment.id ||
          !statusMatches(
            state.payment.status,
            where.status,
          )
        ) {
          return { count: 0 };
        }

        Object.assign(state.payment, data, {
          updatedAt: new Date(),
        });
        return { count: 1 };
      },
    },
    paymentCallbackEvent: {
      create: async ({ data }: any) => {
        const event = {
          id: `event-${events.length + 1}`,
          processed: false,
          ...data,
        };
        events.push(event);
        return event;
      },
      update: async ({ where, data }: any) => {
        const event = events.find(
          (entry) => entry.id === where.id,
        );
        assert.ok(event);
        Object.assign(event, data);
        return event;
      },
    },
    order: {
      findFirst: async ({ where }: any) => {
        if (
          where.id &&
          where.id !== state.order.id
        ) {
          return null;
        }

        if (
          where.tenantId &&
          where.tenantId !== state.order.tenantId
        ) {
          return null;
        }

        if (
          !statusMatches(
            state.order.status,
            where.status,
          )
        ) {
          return null;
        }

        return {
          ...state.order,
          reservations:
            state.reservation.status === "ACTIVE"
              ? [{ ...state.reservation }]
              : [],
          items: state.order.items,
        };
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== state.order.id ||
          !statusMatches(
            state.order.status,
            where.status,
          )
        ) {
          return { count: 0 };
        }

        state.orderClaims += 1;
        Object.assign(state.order, data);
        return { count: 1 };
      },
    },
    inventory: {
      findUnique: async () => ({
        ...state.inventory,
      }),
    },
    inventoryReservation: {
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== state.reservation.id ||
          !statusMatches(
            state.reservation.status,
            where.status,
          )
        ) {
          return { count: 0 };
        }

        Object.assign(state.reservation, data);
        return { count: 1 };
      },
    },
    inventoryMovement: {
      create: async ({ data }: any) => {
        movements.push(data);
        return data;
      },
    },
    $executeRaw: async () => {
      const quantity = state.reservation.quantity;

      if (
        state.inventory.quantity.lt(quantity) ||
        state.inventory.reservedQty.lt(quantity)
      ) {
        return 0;
      }

      state.inventory.quantity =
        state.inventory.quantity.sub(quantity);
      state.inventory.reservedQty =
        state.inventory.reservedQty.sub(quantity);
      state.stockDeductions += 1;
      return 1;
    },
    $transaction: async (operation: any) =>
      typeof operation === "function"
        ? operation(prisma)
        : Promise.all(operation),
  };

  const mpesa: any = {
    normalizePhone: (phone: string) => phone,
    initiateStkPush: async () => {
      state.stkPushCalls += 1;
      return {
        MerchantRequestID: "merchant-1",
        CheckoutRequestID: "checkout-created",
      };
    },
    queryStkPush: async () => {
      state.queryCalls += 1;

      if (options.verificationFails) {
        throw new Error("Provider unavailable");
      }

      return {
        ResultCode:
          options.verificationResultCode ?? 0,
      };
    },
  };

  const ordersService =
    new OrdersService(prisma);
  const service = new PaymentsService(
    prisma,
    mpesa,
    ordersService,
  );

  const successCallback = (
    amount = options.amount ?? "5000.00",
    includeReceipt = true,
    checkoutId = "checkout-1",
  ) => ({
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutId,
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: {
          Item: [
            {
              Name: "Amount",
              Value: amount,
            },
            ...(includeReceipt
              ? [
                  {
                    Name: "MpesaReceiptNumber",
                    Value: "ABC123XYZ",
                  },
                ]
              : []),
            {
              Name: "PhoneNumber",
              Value: "254700000000",
            },
          ],
        },
      },
    },
  });

  const failedCallback = () => ({
    Body: {
      stkCallback: {
        CheckoutRequestID: "checkout-1",
        ResultCode: 1032,
        ResultDesc: "Request cancelled by user",
      },
    },
  });

  return {
    events,
    movements,
    service,
    state,
    successCallback,
    failedCallback,
  };
}

test("correct payment confirms the order and consumes stock once", async () => {
  const harness = createHarness();

  await harness.service.handleMpesaCallback(
    harness.successCallback(),
  );

  assert.equal(harness.state.payment.status, "SUCCEEDED");
  assert.equal(harness.state.order.status, "CONFIRMED");
  assert.equal(
    harness.state.reservation.status,
    "CONSUMED",
  );
  assert.equal(
    harness.state.inventory.quantity.toString(),
    "6",
  );
  assert.equal(harness.state.stockDeductions, 1);
});

test("cancelled STK fails payment and leaves stock reserved", async () => {
  const harness = createHarness();

  await harness.service.handleMpesaCallback(
    harness.failedCallback(),
  );

  assert.equal(harness.state.payment.status, "FAILED");
  assert.equal(
    harness.state.reservation.status,
    "ACTIVE",
  );
  assert.equal(
    harness.state.inventory.reservedQty.toString(),
    "4",
  );
});

test("wrong amount requires review without confirming order", async () => {
  const harness = createHarness();

  await harness.service.handleMpesaCallback(
    harness.successCallback("4999.00"),
  );

  assert.equal(
    harness.state.payment.status,
    "REQUIRES_REVIEW",
  );
  assert.equal(
    harness.state.order.status,
    "AWAITING_PAYMENT",
  );
  assert.equal(harness.state.stockDeductions, 0);
});

test("duplicate callback does not deduct stock twice", async () => {
  const harness = createHarness();
  const callback = harness.successCallback();

  await harness.service.handleMpesaCallback(callback);
  await harness.service.handleMpesaCallback(callback);

  assert.equal(harness.state.stockDeductions, 1);
  assert.equal(
    harness.state.inventory.quantity.toString(),
    "6",
  );
});

test("duplicate success does not confirm the order twice", async () => {
  const harness = createHarness();
  const callback = harness.successCallback();

  await harness.service.handleMpesaCallback(callback);
  await harness.service.handleMpesaCallback(callback);

  assert.equal(harness.state.orderClaims, 1);
  assert.equal(
    harness.events.at(-1)?.processingResult,
    "DUPLICATE_SUCCESS",
  );
});

test("unknown checkout ID is logged without changing order", async () => {
  const harness = createHarness();

  await harness.service.handleMpesaCallback(
    harness.successCallback(
      "5000.00",
      true,
      "unknown-checkout",
    ),
  );

  assert.equal(
    harness.events[0].processingResult,
    "UNKNOWN_CHECKOUT_ID",
  );
  assert.equal(
    harness.state.order.status,
    "AWAITING_PAYMENT",
  );
  assert.equal(harness.state.stockDeductions, 0);
});

test("missing receipt number requires review", async () => {
  const harness = createHarness();

  await harness.service.handleMpesaCallback(
    harness.successCallback(
      "5000.00",
      false,
    ),
  );

  assert.equal(
    harness.state.payment.status,
    "REQUIRES_REVIEW",
  );
  assert.equal(harness.state.stockDeductions, 0);
});

test("provider query failure requires review without fulfilment", async () => {
  const harness = createHarness({
    verificationFails: true,
  });

  await harness.service.handleMpesaCallback(
    harness.successCallback(),
  );

  assert.equal(
    harness.state.payment.status,
    "REQUIRES_REVIEW",
  );
  assert.equal(
    harness.state.order.status,
    "AWAITING_PAYMENT",
  );
  assert.equal(harness.state.stockDeductions, 0);
});

test("expired reservation creates late-payment review without stock deduction", async () => {
  const harness = createHarness({
    reservationStatus: "EXPIRED",
  });

  await harness.service.handleMpesaCallback(
    harness.successCallback(),
  );

  assert.equal(
    harness.state.payment.status,
    "REQUIRES_REVIEW",
  );
  assert.match(
    harness.state.payment.failureReason,
    /reservation expired or was released/,
  );
  assert.equal(harness.state.stockDeductions, 0);
  assert.equal(
    harness.state.inventory.quantity.toString(),
    "10",
  );
});

test("cancelled order sends verified payment to review", async () => {
  const harness = createHarness({
    orderStatus: "CANCELLED",
    reservationStatus: "RELEASED",
  });

  await harness.service.handleMpesaCallback(
    harness.successCallback(),
  );

  assert.equal(
    harness.state.payment.status,
    "REQUIRES_REVIEW",
  );
  assert.equal(harness.state.order.status, "CANCELLED");
  assert.equal(harness.state.stockDeductions, 0);
  assert.equal(
    harness.events[0].processingResult,
    "ORDER_STATE_REQUIRES_REVIEW",
  );
});

test("second initiation is rejected while first attempt is active", async () => {
  const harness = createHarness();
  harness.state.payment = null;

  const user = {
    sub: "user-1",
    tenantId: "tenant-1",
    branchId: "branch-1",
    role: "CASHIER",
    email: "user@example.com",
  };

  await harness.service.initiateOrderMpesa(
    "order-1",
    "254700000000",
    user,
  );

  await assert.rejects(
    harness.service.initiateOrderMpesa(
      "order-1",
      "254700000000",
      user,
    ),
    /already pending/,
  );

  assert.equal(harness.state.stkPushCalls, 1);
});

test("exact callback amount is eligible for provider verification", async () => {
  const harness = createHarness({
    amount: "3500.00",
  });

  await harness.service.handleMpesaCallback(
    harness.successCallback("3500.00"),
  );

  assert.equal(harness.state.queryCalls, 1);
  assert.equal(harness.state.payment.status, "SUCCEEDED");
});
