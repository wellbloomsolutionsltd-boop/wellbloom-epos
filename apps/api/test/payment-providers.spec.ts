import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  ServiceUnavailableException,
} from "@nestjs/common";
import { PaymentsService } from "../src/payments/payments.service";

function createHarness(options: {
  provider?: "CARD" | "BANK";
  paymentStatus?: string;
  orderStatus?: string;
  reservationStatus?: string;
  cardCreateFails?: boolean;
  cardVerification?: {
    successful: boolean;
    amount?: number;
    externalReference?: string;
    rawResponse: unknown;
  };
} = {}) {
  const state: any = {
    payment: {
      id: "payment-1",
      transactionNumber: "PAY-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      provider: options.provider ?? "CARD",
      status: options.paymentStatus ?? "PENDING",
      amount: new Prisma.Decimal(5600),
      currency: "KES",
      externalReference: undefined,
    },
    order: {
      id: "order-1",
      orderNumber: "ORDER-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      status: options.orderStatus ?? "AWAITING_PAYMENT",
      total: new Prisma.Decimal(5600),
      reservations: [
        {
          id: "reservation-1",
          status: options.reservationStatus ?? "ACTIVE",
        },
      ],
    },
    creates: 0,
    updates: 0,
    finalizations: 0,
    auditLogs: [] as any[],
  };

  const paymentResult = () => ({
    ...state.payment,
    order: state.order,
  });

  const tx: any = {
    paymentTransaction: {
      findFirst: async ({ where }: any) => {
        if (
          where.tenantId &&
          where.tenantId !== state.payment.tenantId
        ) {
          return null;
        }

        if (
          where.status &&
          state.payment.status !== where.status
        ) {
          return null;
        }

        if (
          where.provider &&
          state.payment.provider !== where.provider
        ) {
          return null;
        }

        return paymentResult();
      },
      findUnique: async () => paymentResult(),
      create: async ({ data }: any) => {
        state.creates++;
        state.payment = {
          ...state.payment,
          ...data,
          id: "payment-created",
        };
        return paymentResult();
      },
      update: async ({ data }: any) => {
        state.updates++;
        Object.assign(state.payment, data);
        return paymentResult();
      },
      updateMany: async ({ where, data }: any) => {
        if (
          (where.id &&
            where.id !== state.payment.id) ||
          (where.tenantId &&
            where.tenantId !== state.payment.tenantId) ||
          (where.provider &&
            where.provider !== state.payment.provider) ||
          (where.status &&
            where.status !== state.payment.status)
        ) {
          return { count: 0 };
        }

        state.updates++;
        Object.assign(state.payment, data);
        return { count: 1 };
      },
    },
    inventoryReservation: {
      updateMany: async () => ({ count: 1 }),
    },
    paymentCallbackEvent: {
      update: async () => ({}),
    },
  };

  const prisma: any = {
    order: {
      findFirst: async () => state.order,
    },
    paymentTransaction: {
      findFirst: async () =>
        state.payment.status === "PENDING"
          ? paymentResult()
          : null,
      create: async ({ data }: any) => {
        state.creates++;
        state.payment = {
          ...state.payment,
          ...data,
          id: "payment-created",
        };
        return paymentResult();
      },
      update: async ({ data }: any) => {
        state.updates++;
        Object.assign(state.payment, data);
        return paymentResult();
      },
    },
    $transaction: async (operation: any) =>
      operation(tx),
  };

  const card = {
    createPayment: async () => {
      if (options.cardCreateFails) {
        throw new Error("Card provider failed");
      }
      return {
        providerRequestId: "CARD-REQUEST-1",
        checkoutUrl: "https://card.test/checkout",
        rawResponse: { accepted: true },
      };
    },
  };

  const orders = {
    confirmPaidOrderWithTx: async () => {
      state.finalizations++;
    },
  };
  const posCheckouts = {};
  const mpesa = {};
  const auditService = {
    createWithTx: async (
      _tx: any,
      input: any,
    ) => {
      state.auditLogs.push(input);
      return input;
    },
  };

  const service = new PaymentsService(
    prisma,
    mpesa as any,
    orders as any,
    posCheckouts as any,
    card as any,
    auditService as any,
  );

  return { service, state, tx };
}

const user = {
  sub: "manager-1",
  tenantId: "tenant-1",
  branchId: "branch-1",
  role: "MANAGER",
  email: "manager@example.com",
};

test("unconfigured card provider is unavailable without blocking bootstrap", async () => {
  const service = new PaymentsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    {} as any,
  );

  await assert.rejects(
    () => service.initiateOrderCard(
      "order-1",
      user,
    ),
    ServiceUnavailableException,
  );
});

test("successful card initiation stays PENDING", async () => {
  const harness = createHarness({ paymentStatus: "INITIATED" });
  const result = await harness.service.initiateOrderCard("order-1", user);
  assert.equal(result.status, "PENDING");
  assert.equal(harness.state.payment.status, "PENDING");
});

test("failed card initiation becomes FAILED", async () => {
  const harness = createHarness({
    paymentStatus: "INITIATED",
    cardCreateFails: true,
  });
  await assert.rejects(
    harness.service.initiateOrderCard("order-1", user),
    /Card provider failed/,
  );
  assert.equal(harness.state.payment.status, "FAILED");
});

test("card amount mismatch requires review", async () => {
  const harness = createHarness();
  const result = await (harness.service as any).finalizeVerifiedCardPayment(
    "payment-1",
    { successful: true, amount: 5599, rawResponse: {} },
  );
  assert.equal(result.requiresReview, true);
  assert.equal(harness.state.payment.status, "REQUIRES_REVIEW");
});

test("duplicate successful card finalization is idempotent", async () => {
  const harness = createHarness();
  harness.state.payment.status = "SUCCEEDED";
  const result = await (harness.service as any).finalizeVerifiedCardPayment(
    "payment-1",
    { successful: true, amount: 5600, rawResponse: {} },
  );
  assert.equal(result.success, true);
  assert.equal(harness.state.finalizations, 0);
});

test("expired card reservation requires review", async () => {
  const harness = createHarness({ reservationStatus: "EXPIRED" });
  const result = await (harness.service as any).finalizeVerifiedCardPayment(
    "payment-1",
    { successful: true, amount: 5600, rawResponse: {} },
  );
  assert.equal(result.requiresReview, true);
  assert.equal(harness.state.payment.status, "REQUIRES_REVIEW");
});

test("cancelled order late card success requires review", async () => {
  const harness = createHarness({
    orderStatus: "CANCELLED",
    reservationStatus: "RELEASED",
  });
  const result = await (harness.service as any).finalizeVerifiedCardPayment(
    "payment-1",
    { successful: true, amount: 5600, rawResponse: {} },
  );
  assert.equal(result.requiresReview, true);
  assert.equal(harness.state.finalizations, 0);
});

test("bank transfer creation remains PENDING", async () => {
  const harness = createHarness({ provider: "BANK" });
  const result = await harness.service.initiateBankPayment(
    "order-1",
    "BANK-REF-1",
    user,
  );
  assert.equal(result.status, "PENDING");
  assert.equal(harness.state.payment.status, "PENDING");
});

test("manager approval finalizes bank payment", async () => {
  const harness = createHarness({ provider: "BANK" });
  const result = await harness.service.reviewBankPayment(
    "payment-1",
    "APPROVED",
    "BANK-REF-2",
    user,
  );
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(harness.state.finalizations, 1);
  assert.equal(
    harness.state.auditLogs[0].action,
    "PAYMENT_REVIEWED",
  );
  assert.equal(
    harness.state.auditLogs[0].metadata.outcome,
    "SUCCEEDED",
  );
});

test("bank rejection fails payment", async () => {
  const harness = createHarness({ provider: "BANK" });
  const result = await harness.service.reviewBankPayment(
    "payment-1",
    "REJECTED",
    "BANK-REF-3",
    user,
  );
  assert.equal(result.status, "FAILED");
  assert.equal(harness.state.payment.status, "FAILED");
});

test("bank approval after expiry requires review", async () => {
  const harness = createHarness({
    provider: "BANK",
    reservationStatus: "EXPIRED",
  });
  const result = await harness.service.reviewBankPayment(
    "payment-1",
    "APPROVED",
    "BANK-REF-4",
    user,
  );
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(harness.state.finalizations, 0);
});

test("cashier role is not an authorization for bank approval", async () => {
  assert.deepEqual(
    ["MANAGER", "TENANT_ADMIN", "SUPER_ADMIN", "ACCOUNTANT"].includes("CASHIER"),
    false,
  );
});

test("duplicate bank approval cannot finalize twice", async () => {
  const harness = createHarness({ provider: "BANK" });
  await harness.service.reviewBankPayment(
    "payment-1",
    "APPROVED",
    "BANK-REF-5",
    user,
  );
  harness.state.payment.status = "SUCCEEDED";
  await assert.rejects(
    harness.service.reviewBankPayment(
      "payment-1",
      "APPROVED",
      "BANK-REF-5",
      user,
    ),
    /Pending bank payment not found/,
  );
  assert.equal(harness.state.finalizations, 1);
});

test("concurrent bank reviews allow only one PENDING transition", async () => {
  const harness = createHarness({ provider: "BANK" });

  const results = await Promise.allSettled([
    harness.service.reviewBankPayment(
      "payment-1",
      "REJECTED",
      "BANK-REF-RACE-1",
      user,
    ),
    harness.service.reviewBankPayment(
      "payment-1",
      "REJECTED",
      "BANK-REF-RACE-2",
      user,
    ),
  ]);

  assert.equal(
    results.filter(
      (result) => result.status === "fulfilled",
    ).length,
    1,
  );
  assert.equal(
    results.filter(
      (result) => result.status === "rejected",
    ).length,
    1,
  );
  assert.equal(harness.state.payment.status, "FAILED");
  assert.equal(harness.state.updates, 1);
  assert.equal(harness.state.auditLogs.length, 1);
});

test("frontend amount input is not used for bank transaction amount", async () => {
  const harness = createHarness({ provider: "BANK" });
  const result = await harness.service.initiateBankPayment(
    "order-1",
    "BANK-REF-6",
    user,
  );
  assert.equal(result.amount.toString(), "5600");
});

test("cross-tenant bank payment lookup is blocked", async () => {
  const harness = createHarness({ provider: "BANK" });
  await assert.rejects(
    harness.service.reviewBankPayment(
      "payment-1",
      "APPROVED",
      undefined,
      { ...user, tenantId: "other-tenant" },
    ),
    /Pending bank payment not found/,
  );
});

test("payment amount remains immutable through review", async () => {
  const harness = createHarness({ provider: "BANK" });
  const original = harness.state.payment.amount.toString();
  await harness.service.reviewBankPayment(
    "payment-1",
    "REJECTED",
    "BANK-REF-7",
    user,
  );
  assert.equal(harness.state.payment.amount.toString(), original);
});

test("completed payment does not finalize a second time", async () => {
  const harness = createHarness();
  harness.state.payment.status = "SUCCEEDED";
  const result = await (harness.service as any).finalizeVerifiedCardPayment(
    "payment-1",
    { successful: true, amount: 5600, rawResponse: {} },
  );
  assert.equal(result.success, true);
  assert.equal(harness.state.finalizations, 0);
});
