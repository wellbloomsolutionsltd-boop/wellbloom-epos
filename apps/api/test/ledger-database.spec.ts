import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  randomUUID,
} from "node:crypto";
import dotenv from "dotenv";
import {
  Client,
} from "pg";

dotenv.config({
  path: path.resolve(
    __dirname,
    "../../../.env",
  ),
});

function databaseUrl() {
  const configured = process.env.DATABASE_URL;

  if (!configured) {
    throw new Error(
      "DATABASE_URL is required for ledger database tests",
    );
  }

  const url = new URL(configured);
  url.searchParams.delete("schema");
  return url.toString();
}

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function withRollback(
  operation: (
    client: Client,
  ) => Promise<void>,
) {
  const client = new Client({
    connectionString: databaseUrl(),
  });
  await client.connect();
  await client.query("BEGIN");

  try {
    await operation(client);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

let savepointSequence = 0;

async function expectDatabaseRejection(
  client: Client,
  sql: string,
  values: unknown[],
  expected: RegExp,
) {
  const savepoint =
    `expected_failure_${++savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await client.query(sql, values);
  } catch (error) {
    await client.query(
      `ROLLBACK TO SAVEPOINT ${savepoint}`,
    );
    await client.query(
      `RELEASE SAVEPOINT ${savepoint}`,
    );
    assert.match(
      error instanceof Error
        ? error.message
        : String(error),
      expected,
    );
    return;
  }

  await client.query(
    `ROLLBACK TO SAVEPOINT ${savepoint}`,
  );
  await client.query(
    `RELEASE SAVEPOINT ${savepoint}`,
  );
  assert.fail("Expected PostgreSQL to reject mutation");
}

async function createContext(
  client: Client,
) {
  const tenantId = unique("tenant");
  const branchId = unique("branch");
  const userId = unique("user");
  const productId = unique("product");

  await client.query(
    `INSERT INTO "Tenant"
      ("id", "name", "code", "createdAt", "updatedAt")
     VALUES ($1, 'Ledger Test Tenant', $2, NOW(), NOW())`,
    [tenantId, unique("TENANT")],
  );
  await client.query(
    `INSERT INTO "Branch"
      ("id", "name", "code", "tenantId", "createdAt", "updatedAt")
     VALUES ($1, 'Ledger Test Branch', $2, $3, NOW(), NOW())`,
    [branchId, unique("BRANCH"), tenantId],
  );
  await client.query(
    `INSERT INTO "User"
      ("id", "firstName", "lastName", "email", "passwordHash", "role", "tenantId", "branchId", "createdAt", "updatedAt")
     VALUES ($1, 'Ledger', 'Tester', $2, 'not-a-real-password', 'MANAGER', $3, $4, NOW(), NOW())`,
    [
      userId,
      `${unique("ledger")}@example.com`,
      tenantId,
      branchId,
    ],
  );
  await client.query(
    `INSERT INTO "Product"
      ("id", "name", "sku", "sellingPrice", "tenantId", "createdAt", "updatedAt")
     VALUES ($1, 'Ledger Test Product', $2, 100, $3, NOW(), NOW())`,
    [productId, unique("SKU"), tenantId],
  );

  return {
    tenantId,
    branchId,
    userId,
    productId,
  };
}

test("append-only ledgers reject UPDATE and DELETE in PostgreSQL", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const shiftId = unique("shift");
    const auditId = unique("audit");
    const inventoryMovementId = unique("inventory-movement");
    const cashMovementId = unique("cash-movement");

    await client.query(
      `INSERT INTO "Shift"
        ("id", "shiftNumber", "tenantId", "branchId", "userId", "status", "openingCash", "openedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'OPEN', 0, NOW(), NOW(), NOW())`,
      [
        shiftId,
        unique("SHIFT"),
        context.tenantId,
        context.branchId,
        context.userId,
      ],
    );
    await client.query(
      `INSERT INTO "AuditLog"
        ("id", "tenantId", "userId", "action", "createdAt")
       VALUES ($1, $2, $3, 'LEDGER_TEST', NOW())`,
      [auditId, context.tenantId, context.userId],
    );
    await client.query(
      `INSERT INTO "InventoryMovement"
        ("id", "tenantId", "branchId", "productId", "type", "quantity", "quantityBefore", "quantityAfter", "createdById", "createdAt")
       VALUES ($1, $2, $3, $4, 'STOCK_ADJUSTMENT_IN', 1, 0, 1, $5, NOW())`,
      [
        inventoryMovementId,
        context.tenantId,
        context.branchId,
        context.productId,
        context.userId,
      ],
    );
    await client.query(
      `INSERT INTO "CashDrawerMovement"
        ("id", "tenantId", "branchId", "shiftId", "userId", "type", "amount", "createdAt")
       VALUES ($1, $2, $3, $4, $5, 'CASH_IN', 10, NOW())`,
      [
        cashMovementId,
        context.tenantId,
        context.branchId,
        shiftId,
        context.userId,
      ],
    );

    for (const [table, id] of [
      ["AuditLog", auditId],
      ["InventoryMovement", inventoryMovementId],
      ["CashDrawerMovement", cashMovementId],
    ]) {
      await expectDatabaseRejection(
        client,
        `UPDATE "${table}" SET "createdAt" = "createdAt" WHERE "id" = $1`,
        [id],
        /append-only/i,
      );
      await expectDatabaseRejection(
        client,
        `DELETE FROM "${table}" WHERE "id" = $1`,
        [id],
        /append-only/i,
      );
    }
  });
});

test("closed Shift values cannot be rewritten", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const shiftId = unique("shift");

    await client.query(
      `INSERT INTO "Shift"
        ("id", "shiftNumber", "tenantId", "branchId", "userId", "status", "openingCash", "openedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'OPEN', 50, NOW(), NOW(), NOW())`,
      [
        shiftId,
        unique("SHIFT"),
        context.tenantId,
        context.branchId,
        context.userId,
      ],
    );
    await client.query(
      `UPDATE "Shift"
       SET "status" = 'CLOSED',
           "expectedCash" = 50,
           "countedCash" = 50,
           "cashDifference" = 0,
           "closedAt" = NOW(),
           "notes" = 'winner',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [shiftId],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "Shift"
       SET "countedCash" = 999,
           "notes" = 'rewritten',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [shiftId],
      /Closed Shift records are immutable/i,
    );

    const result = await client.query(
      `SELECT "countedCash", "notes"
       FROM "Shift" WHERE "id" = $1`,
      [shiftId],
    );
    assert.equal(result.rows[0].countedCash, "50.00");
    assert.equal(result.rows[0].notes, "winner");
  });
});

test("EndOfDay snapshots reject UPDATE and DELETE", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const endOfDayId = unique("end-of-day");

    await client.query(
      `INSERT INTO "EndOfDay"
        ("id", "businessDate", "tenantId", "branchId", "closedById", "status", "totalSales", "netSales", "closedAt", "createdAt", "updatedAt")
       VALUES ($1, NOW(), $2, $3, $4, 'CLOSED', 100, 100, NOW(), NOW(), NOW())`,
      [
        endOfDayId,
        context.tenantId,
        context.branchId,
        context.userId,
      ],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "EndOfDay" SET "totalSales" = 999 WHERE "id" = $1`,
      [endOfDayId],
      /append-only/i,
    );
    await expectDatabaseRejection(
      client,
      `DELETE FROM "EndOfDay" WHERE "id" = $1`,
      [endOfDayId],
      /append-only/i,
    );
  });
});

test("reservation parent deletion cannot erase history", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const orderId = unique("order");
    const reservationId = unique("reservation");

    await client.query(
      `INSERT INTO "Order"
        ("id", "orderNumber", "tenantId", "branchId", "status", "paymentStatus", "fulfilmentMethod", "subtotal", "discount", "deliveryFee", "total", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'AWAITING_PAYMENT', 'UNPAID', 'PICKUP', 100, 0, 0, 100, NOW(), NOW())`,
      [
        orderId,
        unique("ORDER"),
        context.tenantId,
        context.branchId,
      ],
    );
    await client.query(
      `INSERT INTO "InventoryReservation"
        ("id", "tenantId", "branchId", "productId", "orderId", "quantity", "status", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 1, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW(), NOW())`,
      [
        reservationId,
        context.tenantId,
        context.branchId,
        context.productId,
        orderId,
      ],
    );
    await expectDatabaseRejection(
      client,
      `DELETE FROM "Order" WHERE "id" = $1`,
      [orderId],
      /InventoryReservation_orderId_fkey/i,
    );
    await client.query(
      `UPDATE "InventoryReservation"
       SET "status" = 'RELEASED',
           "releasedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [reservationId],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "InventoryReservation"
       SET "status" = 'ACTIVE', "updatedAt" = NOW()
       WHERE "id" = $1`,
      [reservationId],
      /Terminal InventoryReservation records are immutable/i,
    );
  });
});

test("PaymentTransaction permits valid progress and rejects terminal regression", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const paymentId = unique("payment");

    await client.query(
      `INSERT INTO "PaymentTransaction"
        ("id", "transactionNumber", "tenantId", "branchId", "targetType", "provider", "status", "amount", "currency", "initiatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ORDER', 'MPESA', 'INITIATED', 100, 'KES', NOW(), NOW(), NOW())`,
      [
        paymentId,
        unique("PAY"),
        context.tenantId,
        context.branchId,
      ],
    );

    for (const status of [
      "PENDING",
      "VERIFYING",
      "SUCCEEDED",
    ]) {
      await client.query(
        `UPDATE "PaymentTransaction"
         SET "status" = $2::"PaymentTransactionStatus",
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        [paymentId, status],
      );
    }

    await expectDatabaseRejection(
      client,
      `UPDATE "PaymentTransaction"
       SET "status" = 'PENDING', "updatedAt" = NOW()
       WHERE "id" = $1`,
      [paymentId],
      /Successful PaymentTransaction can only transition to REFUNDED/i,
    );

    const result = await client.query(
      `SELECT "status" FROM "PaymentTransaction" WHERE "id" = $1`,
      [paymentId],
    );
    assert.equal(result.rows[0].status, "SUCCEEDED");
  });
});

test("PaymentCallbackEvent preserves payload while allowing one processing result", async () => {
  await withRollback(async (client) => {
    const callbackId = unique("callback");

    await client.query(
      `INSERT INTO "PaymentCallbackEvent"
        ("id", "provider", "providerCheckoutId", "payload", "processed", "receivedAt")
       VALUES ($1, 'MPESA', $2, $3::jsonb, false, NOW())`,
      [
        callbackId,
        unique("checkout"),
        JSON.stringify({ receipt: "original" }),
      ],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "PaymentCallbackEvent"
       SET "payload" = $2::jsonb,
           "processed" = true,
           "processedAt" = NOW()
       WHERE "id" = $1`,
      [
        callbackId,
        JSON.stringify({ receipt: "rewritten" }),
      ],
      /callback evidence is immutable/i,
    );
    await client.query(
      `UPDATE "PaymentCallbackEvent"
       SET "processed" = true,
           "processingResult" = 'ACCEPTED',
           "processedAt" = NOW()
       WHERE "id" = $1`,
      [callbackId],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "PaymentCallbackEvent"
       SET "processingResult" = 'REWRITTEN'
       WHERE "id" = $1`,
      [callbackId],
      /Processed PaymentCallbackEvent records are immutable/i,
    );
  });
});

test("terminal Sale financial values cannot be rewritten", async () => {
  await withRollback(async (client) => {
    const context = await createContext(client);
    const saleId = unique("sale");

    await client.query(
      `INSERT INTO "Sale"
        ("id", "saleNumber", "receiptNumber", "tenantId", "branchId", "cashierId", "subtotal", "discountAmount", "taxAmount", "totalAmount", "amountPaid", "changeAmount", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 100, 0, 0, 100, 100, 0, 'COMPLETED', NOW(), NOW())`,
      [
        saleId,
        unique("SALE"),
        unique("RECEIPT"),
        context.tenantId,
        context.branchId,
        context.userId,
      ],
    );
    await client.query(
      `UPDATE "Sale"
       SET "status" = 'VOIDED',
           "voidedById" = $2,
           "voidReason" = 'test correction',
           "voidedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [saleId, context.userId],
    );
    await expectDatabaseRejection(
      client,
      `UPDATE "Sale"
       SET "totalAmount" = 1, "updatedAt" = NOW()
       WHERE "id" = $1`,
      [saleId],
      /Terminal Sale records are immutable/i,
    );
  });
});
