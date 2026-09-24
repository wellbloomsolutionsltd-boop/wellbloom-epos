import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  assertBranchAccess,
  getBranchScope,
} from "../src/common/authorization/branch-access";
import { CustomersService } from "../src/customers/customers.service";
import { EndOfDayService } from "../src/end-of-day/end-of-day.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { OrdersService } from "../src/orders/orders.service";
import { PaymentsService } from "../src/payments/payments.service";
import { PosCheckoutsService } from "../src/pos-checkouts/pos-checkouts.service";
import { PricingService } from "../src/pricing/pricing.service";
import { ProductsService } from "../src/products/products.service";
import { ReportsService } from "../src/reports/reports.service";
import { ReturnsService } from "../src/returns/returns.service";
import { SalesService } from "../src/sales/sales.service";
import { ShiftsService } from "../src/shifts/shifts.service";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const branchA1 = "branch-a1";
const branchA2 = "branch-a2";
const branchB = "branch-b";

const branchUser: any = {
  sub: "cashier-a1",
  tenantId: tenantA,
  branchId: branchA1,
  role: "CASHIER",
  email: "cashier-a1@example.test",
};

const manager: any = {
  sub: "manager-a",
  tenantId: tenantA,
  branchId: branchA1,
  role: "MANAGER",
  email: "manager-a@example.test",
};

const branches = [
  { id: branchA1, tenantId: tenantA },
  { id: branchA2, tenantId: tenantA },
  { id: branchB, tenantId: tenantB },
];

function branchDelegate() {
  return {
    findFirst: async ({ where }: any) =>
      branches.find(
        (branch) =>
          branch.id === where.id &&
          branch.tenantId === where.tenantId,
      ) ?? null,
  };
}

test("branch helper enforces assigned, tenant-wide, and tenant ownership rules", async () => {
  const db: any = { branch: branchDelegate() };

  assert.equal(getBranchScope(branchUser), branchA1);
  assert.equal(getBranchScope(manager), undefined);
  assert.equal(
    (await assertBranchAccess(db, branchUser, branchA1)).id,
    branchA1,
  );
  await assert.rejects(
    () => assertBranchAccess(db, branchUser, branchA2),
    NotFoundException,
  );
  assert.equal(
    (await assertBranchAccess(db, manager, branchA2)).id,
    branchA2,
  );
  await assert.rejects(
    () => assertBranchAccess(db, manager, branchB),
    NotFoundException,
  );
});

test("reports constrain branch users and allow tenant-wide managers", async () => {
  const sales = [
    { branchId: branchA1, amount: 100 },
    { branchId: branchA2, amount: 200 },
  ];
  const prisma: any = {
    branch: branchDelegate(),
    sale: {
      findMany: async ({ where }: any) =>
        sales
          .filter(
            (sale) =>
              !where.branchId || sale.branchId === where.branchId,
          )
          .map((sale) => ({
            createdAt: new Date(),
            subtotal: new Prisma.Decimal(sale.amount),
            discountAmount: new Prisma.Decimal(0),
            totalAmount: new Prisma.Decimal(sale.amount),
          })),
    },
  };
  const service = new ReportsService(prisma);

  assert.equal(
    (await service.getSalesByPeriod(branchUser, undefined, undefined, branchA1))[0]
      .netSales,
    100,
  );
  await assert.rejects(
    () =>
      service.getSalesByPeriod(
        branchUser,
        undefined,
        undefined,
        branchA2,
      ),
    NotFoundException,
  );
  assert.equal(
    (await service.getSalesByPeriod(manager, undefined, undefined, branchA2))[0]
      .netSales,
    200,
  );
  await assert.rejects(
    () =>
      service.getSalesByPeriod(
        manager,
        undefined,
        undefined,
        branchB,
      ),
    NotFoundException,
  );
});

test("product inventory and customer sale relations use branch scope", async () => {
  const observed: string[] = [];
  const prisma: any = {
    product: {
      findMany: async ({ include }: any) => {
        observed.push(include.inventory.where.branchId);
        return [];
      },
    },
    customer: {
      findFirst: async ({ include }: any) => {
        observed.push(include.sales.where.branchId);
        return { id: "customer-a", tenantId: tenantA };
      },
    },
  };

  await new ProductsService(prisma).findAll(branchUser);
  await new CustomersService(prisma).findOne(
    "customer-a",
    branchUser,
  );
  assert.deepEqual(observed, [branchA1, branchA1]);
});

test("inventory availability rejects lateral branch access", async () => {
  const prisma: any = {
    branch: branchDelegate(),
    inventory: {
      findFirst: async ({ where }: any) => ({
        branchId: where.branchId,
        productId: where.productId,
        quantity: new Prisma.Decimal(5),
        reservedQty: new Prisma.Decimal(1),
        product: { tenantId: tenantA },
        branch: { tenantId: tenantA },
      }),
    },
  };
  const service = new InventoryService(prisma);

  assert.equal(
    (
      await service.getProductAvailability(
        "product-a",
        branchA1,
        branchUser,
      )
    ).availableQty.toString(),
    "4",
  );
  await assert.rejects(
    () =>
      service.getProductAvailability(
        "product-a",
        branchA2,
        branchUser,
      ),
    NotFoundException,
  );
  assert.equal(
    (
      await service.getProductAvailability(
        "product-a",
        branchA2,
        manager,
      )
    ).branchId,
    branchA2,
  );
});

test("pricing mutations enforce branch authorization", async () => {
  const created: string[] = [];
  const tx: any = {
    productPrice: {
      create: async ({ data }: any) => {
        created.push(data.branchId);
        return {
          id: `price-${data.branchId}`,
          ...data,
          price: new Prisma.Decimal(data.price),
        };
      },
    },
  };
  const prisma: any = {
    branch: branchDelegate(),
    product: {
      findFirst: async () => ({ id: "product-a" }),
    },
    $transaction: async (callback: (client: any) => unknown) =>
      callback(tx),
  };
  const service = new PricingService(prisma, {
    createWithTx: async () => undefined,
  } as any);
  const dto: any = {
    productId: "product-a",
    branchId: branchA1,
    channel: "POS",
    price: 120,
  };

  await service.setProductPrice(dto, branchUser);
  await assert.rejects(
    () =>
      service.setProductPrice(
        { ...dto, branchId: branchA2 },
        branchUser,
      ),
    NotFoundException,
  );
  await service.setProductPrice(
    { ...dto, branchId: branchA2 },
    manager,
  );
  assert.deepEqual(created, [branchA1, branchA2]);
});

test("sales reads enforce branch scope", async () => {
  const sales = [
    { id: "sale-a1", tenantId: tenantA, branchId: branchA1 },
    { id: "sale-a2", tenantId: tenantA, branchId: branchA2 },
  ];
  const prisma: any = {
    sale: {
      findUnique: async ({ where }: any) =>
        sales.find(
          (sale) =>
            sale.id === where.id &&
            sale.tenantId === where.tenantId &&
            (!where.branchId || sale.branchId === where.branchId),
        ) ?? null,
    },
  };
  const service = new SalesService(prisma, {} as any, {} as any);

  assert.equal((await service.findOne("sale-a1", branchUser)).id, "sale-a1");
  await assert.rejects(
    () => service.findOne("sale-a2", branchUser),
    NotFoundException,
  );
  assert.equal((await service.findOne("sale-a2", manager)).id, "sale-a2");
});

test("order reads and mutations enforce branch scope", async () => {
  let mutations = 0;
  const orders = [
    { id: "order-a1", tenantId: tenantA, branchId: branchA1 },
    { id: "order-a2", tenantId: tenantA, branchId: branchA2 },
  ];
  const tx: any = {
    order: {
      findFirst: async ({ where }: any) =>
        orders.find(
          (order) =>
            order.id === where.id &&
            order.tenantId === where.tenantId &&
            (!where.branchId || order.branchId === where.branchId),
        ) ?? null,
      updateMany: async () => {
        mutations++;
        return { count: 1 };
      },
    },
  };
  const prisma: any = {
    order: tx.order,
    $transaction: async (callback: (client: any) => unknown) =>
      callback(tx),
  };
  const service = new OrdersService(prisma, {} as any);

  assert.equal((await service.getOrder("order-a1", branchUser)).id, "order-a1");
  await assert.rejects(
    () => service.getOrder("order-a2", branchUser),
    NotFoundException,
  );
  assert.equal((await service.getOrder("order-a2", manager)).id, "order-a2");
  await assert.rejects(() => service.cancelOrder("order-a2", branchUser));
  assert.equal(mutations, 0);
});

test("payment reads enforce branch scope", async () => {
  const payments = [
    { transactionNumber: "PAY-A1", tenantId: tenantA, branchId: branchA1 },
    { transactionNumber: "PAY-A2", tenantId: tenantA, branchId: branchA2 },
  ];
  const prisma: any = {
    paymentTransaction: {
      findFirst: async ({ where }: any) =>
        payments.find(
          (payment) =>
            payment.transactionNumber === where.transactionNumber &&
            payment.tenantId === where.tenantId &&
            (!where.branchId || payment.branchId === where.branchId),
        ) ?? null,
    },
  };
  const service = new PaymentsService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    {} as any,
  );

  assert.equal(
    (await service.getPaymentStatus("PAY-A1", branchUser)).transactionNumber,
    "PAY-A1",
  );
  await assert.rejects(
    () => service.getPaymentStatus("PAY-A2", branchUser),
    NotFoundException,
  );
  assert.equal(
    (await service.getPaymentStatus("PAY-A2", manager)).transactionNumber,
    "PAY-A2",
  );
});

test("payment initiation cannot target another branch's order", async () => {
  let creates = 0;
  const prisma: any = {
    order: {
      findFirst: async ({ where }: any) =>
        where.id === "order-a2" &&
        where.tenantId === tenantA &&
        (!where.branchId || where.branchId === branchA2)
          ? {
              id: "order-a2",
              tenantId: tenantA,
              branchId: branchA2,
              status: "AWAITING_PAYMENT",
              total: new Prisma.Decimal(100),
            }
          : null,
    },
    paymentTransaction: {
      create: async () => {
        creates++;
      },
    },
  };
  const service = new PaymentsService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.initiateBankPayment(
        "order-a2",
        "BANK-REF",
        branchUser,
      ),
    NotFoundException,
  );
  assert.equal(creates, 0);
});

test("return listings use assigned branch scope", async () => {
  let receivedWhere: any;
  const prisma: any = {
    return: {
      findMany: async ({ where }: any) => {
        receivedWhere = where;
        return [];
      },
    },
  };
  const service = new ReturnsService(prisma, {} as any);

  await service.findAll(branchUser);
  assert.equal(receivedWhere.tenantId, tenantA);
  assert.equal(receivedWhere.branchId, branchA1);
});

test("shift reads remain bound to the user's assigned branch", async () => {
  let receivedWhere: any;
  const prisma: any = {
    shift: {
      findFirst: async ({ where }: any) => {
        receivedWhere = where;
        return { id: "shift-a1", branchId: where.branchId };
      },
    },
  };
  const service = new ShiftsService(prisma, {} as any);

  await service.getCurrentShift(branchUser);
  assert.equal(receivedWhere.branchId, branchA1);
  assert.equal(receivedWhere.tenantId, tenantA);
});

test("End-of-Day remains bound to the user's assigned branch", async () => {
  const branchIds: string[] = [];
  const prisma: any = {
    shift: {
      findMany: async ({ where }: any) => {
        branchIds.push(where.branchId);
        return [];
      },
    },
    sale: {
      findMany: async ({ where }: any) => {
        branchIds.push(where.branchId);
        return [];
      },
    },
  };
  const service = new EndOfDayService(prisma, {} as any);

  await service.getCurrentSummary(branchUser);
  assert.deepEqual(branchIds, [branchA1, branchA1]);
});

test("POS checkout status enforces branch scope", async () => {
  const checkouts = [
    { id: "checkout-a1", tenantId: tenantA, branchId: branchA1 },
    { id: "checkout-a2", tenantId: tenantA, branchId: branchA2 },
  ];
  const prisma: any = {
    posCheckout: {
      findFirst: async ({ where }: any) =>
        checkouts.find(
          (checkout) =>
            checkout.id === where.id &&
            checkout.tenantId === where.tenantId &&
            (!where.branchId || checkout.branchId === where.branchId),
        ) ?? null,
    },
  };
  const service = new PosCheckoutsService(prisma, {} as any);

  assert.equal((await service.getStatus("checkout-a1", branchUser)).id, "checkout-a1");
  await assert.rejects(
    () => service.getStatus("checkout-a2", branchUser),
    NotFoundException,
  );
  assert.equal((await service.getStatus("checkout-a2", manager)).id, "checkout-a2");
});
