import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  EndOfDayService,
} from "../src/end-of-day/end-of-day.service";
import {
  SalesService,
} from "../src/sales/sales.service";
import {
  ShiftsService,
} from "../src/shifts/shifts.service";

const manager = {
  sub: "manager-1",
  tenantId: "tenant-1",
  branchId: "branch-1",
  role: "MANAGER",
  email: "manager@example.com",
};

function createReadBarrier(parties = 2) {
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals++;

    if (arrivals === parties) {
      release();
    }

    await ready;
  };
}

function assertSingleConflict(
  results: PromiseSettledResult<unknown>[],
) {
  assert.equal(
    results.filter(
      (result) => result.status === "fulfilled",
    ).length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof ConflictException,
    ).length,
    1,
  );
}

test("concurrent sale voids create exactly one set of compensating records", async () => {
  const waitForBothReads = createReadBarrier();
  const state: any = {
    sale: {
      id: "sale-1",
      saleNumber: "SALE-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      shiftId: "shift-1",
      status: "COMPLETED",
      totalAmount: new Prisma.Decimal(100),
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      items: [
        {
          productId: "product-1",
          quantity: new Prisma.Decimal(2),
        },
      ],
      payments: [
        {
          method: "CASH",
          amount: new Prisma.Decimal(100),
        },
      ],
    },
    inventoryQuantity: new Prisma.Decimal(8),
    inventoryMovements: [] as any[],
    cashMovements: [] as any[],
    auditLogs: [] as any[],
  };

  const tx: any = {
    sale: {
      findFirst: async () => {
        const snapshot = {
          ...state.sale,
          items: [...state.sale.items],
          payments: [...state.sale.payments],
        };
        await waitForBothReads();
        return snapshot;
      },
      updateMany: async ({ where, data }: any) => {
        if (
          state.sale.id !== where.id ||
          state.sale.tenantId !== where.tenantId ||
          state.sale.status !== where.status ||
          state.sale.voidedAt !== where.voidedAt ||
          state.sale.voidedById !== where.voidedById
        ) {
          return { count: 0 };
        }

        Object.assign(state.sale, data);
        return { count: 1 };
      },
      findUnique: async () => ({
        ...state.sale,
      }),
    },
    inventory: {
      findUnique: async () => ({
        quantity: state.inventoryQuantity,
      }),
      update: async ({ data }: any) => {
        state.inventoryQuantity =
          state.inventoryQuantity.add(
            data.quantity.increment,
          );
        return {
          quantity: state.inventoryQuantity,
        };
      },
    },
    inventoryMovement: {
      create: async ({ data }: any) => {
        state.inventoryMovements.push(data);
        return data;
      },
    },
    shift: {
      findFirst: async () => ({
        id: "shift-1",
        status: "OPEN",
      }),
    },
    cashDrawerMovement: {
      create: async ({ data }: any) => {
        state.cashMovements.push(data);
        return data;
      },
    },
  };
  const prisma: any = {
    $transaction: async (operation: any) =>
      operation(tx),
  };
  const auditService: any = {
    createWithTx: async (_tx: any, input: any) => {
      state.auditLogs.push(input);
      return input;
    },
  };
  const service = new SalesService(
    prisma,
    {} as any,
    auditService,
  );

  const results = await Promise.allSettled([
    service.voidSale("sale-1", "reason-one", manager),
    service.voidSale("sale-1", "reason-two", manager),
  ]);

  assertSingleConflict(results);
  assert.equal(state.sale.status, "VOIDED");
  assert.equal(state.inventoryQuantity.toString(), "10");
  assert.equal(state.inventoryMovements.length, 1);
  assert.equal(
    state.inventoryMovements[0].type,
    "SALE_VOID",
  );
  assert.equal(state.cashMovements.length, 1);
  assert.equal(
    state.cashMovements[0].type,
    "CASH_REFUND",
  );
  assert.equal(state.auditLogs.length, 1);
  assert.equal(
    state.auditLogs[0].metadata.reason,
    state.sale.voidReason,
  );
});

test("concurrent shift closes create one closing count and preserve the winner totals", async () => {
  const waitForBothReads = createReadBarrier();
  let guardedReads = 0;
  const state: any = {
    shift: {
      id: "shift-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      userId: "manager-1",
      status: "OPEN",
      notes: "opening note",
    },
    cashMovements: [] as any[],
    auditLogs: [] as any[],
  };

  const tx: any = {
    shift: {
      findUnique: async () => {
        const snapshot = {
          ...state.shift,
        };

        if (
          snapshot.status === "OPEN" &&
          guardedReads < 2
        ) {
          guardedReads++;
          await waitForBothReads();
        }

        return snapshot;
      },
      updateMany: async ({ where, data }: any) => {
        if (
          state.shift.id !== where.id ||
          state.shift.tenantId !== where.tenantId ||
          state.shift.branchId !== where.branchId ||
          state.shift.status !== where.status
        ) {
          return { count: 0 };
        }

        Object.assign(state.shift, data);
        return { count: 1 };
      },
    },
    cashDrawerMovement: {
      findMany: async () => [
        {
          type: "OPENING_FLOAT",
          amount: new Prisma.Decimal(100),
        },
      ],
      create: async ({ data }: any) => {
        state.cashMovements.push(data);
        return data;
      },
    },
  };
  const prisma: any = {
    shift: {
      findFirst: async () => ({
        ...state.shift,
      }),
    },
    $transaction: async (operation: any) =>
      operation(tx),
  };
  const auditService: any = {
    createWithTx: async (_tx: any, input: any) => {
      state.auditLogs.push(input);
      return input;
    },
  };
  const service = new ShiftsService(
    prisma,
    auditService,
  );

  const results = await Promise.allSettled([
    service.closeShift(
      {
        countedCash: 120,
        notes: "first close",
      },
      manager,
    ),
    service.closeShift(
      {
        countedCash: 150,
        notes: "second close",
      },
      manager,
    ),
  ]);

  assertSingleConflict(results);
  const winner = results.find(
    (result) => result.status === "fulfilled",
  );
  assert.ok(winner);
  assert.equal(state.shift.status, "CLOSED");
  assert.equal(state.cashMovements.length, 1);
  assert.equal(
    state.cashMovements[0].type,
    "CLOSING_COUNT",
  );
  assert.equal(state.auditLogs.length, 1);
  assert.equal(
    state.shift.countedCash.toString(),
    winner.value.countedCash.toString(),
  );
  assert.equal(state.shift.notes, winner.value.notes);
  assert.equal(
    state.shift.cashDifference.toString(),
    winner.value.cashDifference.toString(),
  );
});

test("concurrent End-of-Day closes create one immutable winner snapshot", async () => {
  const waitForBothReads = createReadBarrier();
  const businessDate = new Date("2026-09-23T00:00:00.000Z");
  const state: any = {
    endOfDay: null,
    auditLogs: [] as any[],
  };
  const summaries = [100, 200].map((amount) => ({
    businessDate,
    openShiftCount: 0,
    grossSales: new Prisma.Decimal(amount),
    totalDiscount: new Prisma.Decimal(0),
    totalReturns: new Prisma.Decimal(0),
    netSales: new Prisma.Decimal(amount),
    cashTotal: new Prisma.Decimal(amount),
    mpesaTotal: new Prisma.Decimal(0),
    cardTotal: new Prisma.Decimal(0),
    bankTotal: new Prisma.Decimal(0),
    insuranceTotal: new Prisma.Decimal(0),
    otherTotal: new Prisma.Decimal(0),
    transactionCount: amount / 100,
    shiftCount: 1,
    totalCashVariance: new Prisma.Decimal(0),
  }));
  let summaryIndex = 0;

  const tx: any = {
    shift: {
      count: async () => 0,
    },
    endOfDay: {
      findUnique: async () => {
        const snapshot = state.endOfDay;
        await waitForBothReads();
        return snapshot;
      },
      create: async ({ data }: any) => {
        if (state.endOfDay) {
          throw {
            code: "P2002",
          };
        }

        state.endOfDay = {
          id: "end-of-day-1",
          ...data,
        };
        return state.endOfDay;
      },
    },
  };
  const prisma: any = {
    $transaction: async (operation: any) =>
      operation(tx),
  };
  const auditService: any = {
    createWithTx: async (_tx: any, input: any) => {
      state.auditLogs.push(input);
      return input;
    },
  };
  const service = new EndOfDayService(
    prisma,
    auditService,
  );
  (service as any).getCurrentSummary = async () =>
    summaries[summaryIndex++];

  const results = await Promise.allSettled([
    service.closeEndOfDay(
      {
        notes: "first snapshot",
      },
      manager,
    ),
    service.closeEndOfDay(
      {
        notes: "second snapshot",
      },
      manager,
    ),
  ]);

  assertSingleConflict(results);
  const winner = results.find(
    (result) => result.status === "fulfilled",
  );
  assert.ok(winner);
  assert.equal(state.auditLogs.length, 1);
  assert.equal(state.endOfDay.id, "end-of-day-1");
  assert.equal(
    state.endOfDay.totalSales.toString(),
    winner.value.totalSales.toString(),
  );
  assert.equal(
    state.endOfDay.transactionCount,
    winner.value.transactionCount,
  );
  assert.equal(state.endOfDay.notes, winner.value.notes);
});
