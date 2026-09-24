import assert from "node:assert/strict";
import test from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Prisma } from "@prisma/client";
import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { CustomersService } from "../src/customers/customers.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { OrdersService } from "../src/orders/orders.service";
import { PaymentsService } from "../src/payments/payments.service";
import { PosCheckoutsService } from "../src/pos-checkouts/pos-checkouts.service";
import { PricingService } from "../src/pricing/pricing.service";
import { ProductsController } from "../src/products/products.controller";
import { ProductsService } from "../src/products/products.service";
import { ReportsService } from "../src/reports/reports.service";
import { ReturnsService } from "../src/returns/returns.service";
import { SalesService } from "../src/sales/sales.service";
import { ShiftsService } from "../src/shifts/shifts.service";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const branchA = "branch-a";
const branchB = "branch-b";
const productA = "product-a";
const productB = "product-b";
const customerA = "customer-a";
const customerB = "customer-b";
const saleA = "sale-a";
const saleB = "sale-b";
const orderA = "order-a";
const orderB = "order-b";

const userA: any = {
  sub: "user-a",
  tenantId: tenantA,
  branchId: branchA,
  role: "MANAGER",
  email: "manager-a@example.test",
};

const products = [
  {
    id: productA,
    tenantId: tenantA,
    name: "Tenant A product",
    barcode: "shared-barcode",
    isActive: true,
    sellingPrice: new Prisma.Decimal(100),
    inventory: [],
  },
  {
    id: productB,
    tenantId: tenantB,
    name: "Tenant B product",
    barcode: "tenant-b-only",
    isActive: true,
    sellingPrice: new Prisma.Decimal(200),
    inventory: [],
  },
];

function matchesWhere(record: any, where: any) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) {
      return true;
    }
    if (key === "OR" || key === "AND") {
      return true;
    }
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected)
    ) {
      if ("in" in expected) {
        return (expected.in as unknown[]).includes(record[key]);
      }
      return true;
    }
    return record[key] === expected;
  });
}

test("product controller requires JWT authentication", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, ProductsController) ?? [];
  assert.ok(guards.includes(JwtAuthGuard));
});

test("product list returns only same-tenant products", async () => {
  const prisma: any = {
    product: {
      findMany: async ({ where }: any) =>
        products.filter((record) => matchesWhere(record, where)),
    },
  };
  const service = new ProductsService(prisma);

  const result = await service.findAll(userA);

  assert.deepEqual(result.map((entry) => entry.id), [productA]);
});

test("barcode lookup cannot resolve another tenant's product", async () => {
  const prisma: any = {
    product: {
      findFirst: async ({ where }: any) =>
        products.find((record) => matchesWhere(record, where)) ?? null,
    },
  };
  const service = new ProductsService(prisma);

  const sameTenant = await service.findByBarcode(
    "shared-barcode",
    userA,
  );
  assert.equal(sameTenant.id, productA);

  await assert.rejects(
    () => service.findByBarcode("tenant-b-only", userA),
    NotFoundException,
  );
});

test("inventory availability requires same-tenant product and branch", async () => {
  const inventory = [
    {
      id: "inventory-a",
      branchId: branchA,
      productId: productA,
      quantity: new Prisma.Decimal(10),
      reservedQty: new Prisma.Decimal(2),
      product: products[0],
      branch: { id: branchA, tenantId: tenantA },
    },
    {
      id: "inventory-b",
      branchId: branchB,
      productId: productB,
      quantity: new Prisma.Decimal(20),
      reservedQty: new Prisma.Decimal(1),
      product: products[1],
      branch: { id: branchB, tenantId: tenantB },
    },
  ];
  const prisma: any = {
    branch: {
      findFirst: async ({ where }: any) =>
        where.id === branchA && where.tenantId === tenantA
          ? { id: branchA, tenantId: tenantA }
          : null,
    },
    inventory: {
      findFirst: async ({ where }: any) =>
        inventory.find(
          (record) =>
            record.branchId === where.branchId &&
            record.productId === where.productId &&
            record.product.tenantId === where.product.tenantId &&
            record.branch.tenantId === where.branch.tenantId,
        ) ?? null,
    },
  };
  const service = new InventoryService(prisma);

  const available = await service.getProductAvailability(
    productA,
    branchA,
    userA,
  );
  assert.equal(available.availableQty.toString(), "8");

  await assert.rejects(
    () => service.getProductAvailability(productB, branchB, userA),
    NotFoundException,
  );
});

test("customer reads cannot cross tenants", async () => {
  const customers = [
    { id: customerA, tenantId: tenantA },
    { id: customerB, tenantId: tenantB },
  ];
  const prisma: any = {
    customer: {
      findFirst: async ({ where }: any) =>
        customers.find((record) => matchesWhere(record, where)) ?? null,
    },
  };
  const service = new CustomersService(prisma);

  assert.equal((await service.findOne(customerA, userA)).id, customerA);
  await assert.rejects(
    () => service.findOne(customerB, userA),
    NotFoundException,
  );
});

test("sale reads cannot cross tenants", async () => {
  const sales = [
    { id: saleA, tenantId: tenantA },
    { id: saleB, tenantId: tenantB },
  ];
  const prisma: any = {
    sale: {
      findUnique: async ({ where }: any) =>
        sales.find((record) => matchesWhere(record, where)) ?? null,
    },
  };
  const service = new SalesService(prisma, {} as any, {} as any);

  assert.equal((await service.findOne(saleA, userA)).id, saleA);
  await assert.rejects(
    () => service.findOne(saleB, userA),
    NotFoundException,
  );
});

test("sale void cannot mutate another tenant's sale", async () => {
  let mutations = 0;
  const tx: any = {
    sale: {
      findFirst: async ({ where }: any) =>
        where.id === saleA && where.tenantId === tenantA
          ? { id: saleA, tenantId: tenantA, status: "COMPLETED" }
          : null,
      updateMany: async () => {
        mutations++;
        return { count: 1 };
      },
    },
  };
  const prisma: any = {
    $transaction: async (callback: (client: any) => unknown) =>
      callback(tx),
  };
  const service = new SalesService(prisma, {} as any, {} as any);

  await assert.rejects(
    () => service.voidSale(saleB, "not mine", userA),
    NotFoundException,
  );
  assert.equal(mutations, 0);
});

test("return requests cannot reference another tenant's sale", async () => {
  let creates = 0;
  const prisma: any = {
    sale: {
      findFirst: async ({ where }: any) =>
        where.id === saleA && where.tenantId === tenantA
          ? { id: saleA, tenantId: tenantA, branchId: branchA }
          : null,
    },
    return: {
      create: async () => {
        creates++;
      },
    },
  };
  const service = new ReturnsService(prisma, {} as any);

  await assert.rejects(
    () =>
      service.requestReturn(
        {
          saleId: saleB,
          reason: "not mine",
          refundMethod: "CASH",
          items: [],
        },
        userA,
      ),
    NotFoundException,
  );
  assert.equal(creates, 0);
});

test("shift review cannot access another tenant's request", async () => {
  const tx: any = {
    cashMovementRequest: {
      findFirst: async ({ where }: any) =>
        where.id === "request-a" && where.tenantId === tenantA
          ? { id: "request-a", tenantId: tenantA, status: "PENDING" }
          : null,
    },
  };
  const prisma: any = {
    $transaction: async (callback: (client: any) => unknown) =>
      callback(tx),
  };
  const service = new ShiftsService(prisma, {} as any);

  await assert.rejects(
    () =>
      service.reviewCashMovement(
        "request-b",
        { decision: "REJECTED" },
        userA,
      ),
    NotFoundException,
  );
});

test("order reads cannot cross tenants", async () => {
  const orders = [
    { id: orderA, tenantId: tenantA },
    { id: orderB, tenantId: tenantB },
  ];
  const prisma: any = {
    order: {
      findFirst: async ({ where }: any) =>
        orders.find((record) => matchesWhere(record, where)) ?? null,
    },
  };
  const service = new OrdersService(prisma, {} as any);

  assert.equal((await service.getOrder(orderA, userA)).id, orderA);
  await assert.rejects(
    () => service.getOrder(orderB, userA),
    NotFoundException,
  );
});

test("payment status cannot cross tenants", async () => {
  const payments = [
    {
      id: "payment-a",
      tenantId: tenantA,
      transactionNumber: "PAY-A",
    },
    {
      id: "payment-b",
      tenantId: tenantB,
      transactionNumber: "PAY-B",
    },
  ];
  const prisma: any = {
    paymentTransaction: {
      findFirst: async ({ where }: any) =>
        payments.find((record) => matchesWhere(record, where)) ?? null,
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
    (await service.getPaymentStatus("PAY-A", userA)).transactionNumber,
    "PAY-A",
  );
  await assert.rejects(
    () => service.getPaymentStatus("PAY-B", userA),
    NotFoundException,
  );
});

test("pricing cannot resolve another tenant's product", async () => {
  const prisma: any = {
    product: {
      findFirst: async ({ where }: any) =>
        products.find((record) => matchesWhere(record, where)) ?? null,
    },
    productPrice: {
      findFirst: async () => null,
    },
  };
  const service = new PricingService(prisma, {} as any);

  const sameTenant = await service.resolveProductPrice({
    tenantId: tenantA,
    productId: productA,
    branchId: branchA,
    channel: "POS",
  });
  assert.equal(sameTenant.price.toString(), "100");

  await assert.rejects(
    () =>
      service.resolveProductPrice({
        tenantId: tenantA,
        productId: productB,
        branchId: branchB,
        channel: "POS",
      }),
    NotFoundException,
  );
});

test("foreign branch cannot be used for a pricing mutation", async () => {
  const prisma: any = {
    product: {
      findFirst: async ({ where }: any) =>
        products.find((record) => matchesWhere(record, where)) ?? null,
    },
    branch: {
      findFirst: async ({ where }: any) =>
        where.id === branchA && where.tenantId === tenantA
          ? { id: branchA, tenantId: tenantA }
          : null,
    },
  };
  const service = new PricingService(prisma, {} as any);

  await assert.rejects(
    () =>
      service.setProductPrice(
        {
          productId: productA,
          branchId: branchB,
          channel: "POS",
          price: 120,
        },
        userA,
      ),
    NotFoundException,
  );
});

test("internal order finalization enforces the payment tenant", async () => {
  let updates = 0;
  const tx: any = {
    order: {
      findFirst: async ({ where }: any) =>
        where.id === orderB && where.tenantId === tenantB
          ? { id: orderB, tenantId: tenantB, reservations: [] }
          : null,
      updateMany: async () => {
        updates++;
        return { count: 1 };
      },
    },
  };
  const service = new OrdersService({} as any, {} as any);

  await assert.rejects(
    () => service.confirmPaidOrderWithTx(tx, orderB, tenantA),
    BadRequestException,
  );
  assert.equal(updates, 0);
});

test("internal POS finalization enforces the payment tenant", async () => {
  const tx: any = {
    posCheckout: {
      findFirst: async ({ where }: any) =>
        where.id === "checkout-b" && where.tenantId === tenantB
          ? { id: "checkout-b", tenantId: tenantB }
          : null,
    },
  };
  const service = new PosCheckoutsService(
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.confirmPaidPosCheckoutWithTx(
        tx,
        "checkout-b",
        "payment-b",
        tenantA,
      ),
    NotFoundException,
  );
});

test("reports return only the authenticated tenant's sales", async () => {
  const sales = [
    {
      id: saleA,
      tenantId: tenantA,
      branchId: branchA,
      status: "COMPLETED",
      createdAt: new Date(),
      subtotal: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(100),
    },
    {
      id: saleB,
      tenantId: tenantB,
      branchId: branchB,
      status: "COMPLETED",
      createdAt: new Date(),
      subtotal: new Prisma.Decimal(200),
      discountAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(200),
    },
  ];
  const prisma: any = {
    sale: {
      findMany: async ({ where }: any) =>
        sales.filter(
          (record) =>
            record.tenantId === where.tenantId &&
            (!where.branchId || record.branchId === where.branchId),
        ),
    },
  };
  const service = new ReportsService(prisma);

  const result = await service.getSalesByPeriod(userA);

  assert.equal(result.length, 1);
  assert.equal(result[0].netSales, 100);
});
