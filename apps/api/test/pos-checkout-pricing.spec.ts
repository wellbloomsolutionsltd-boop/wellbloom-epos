import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { PosCheckoutsService } from "../src/pos-checkouts/pos-checkouts.service";
import { PricingService } from "../src/pricing/pricing.service";

type TestPrice = {
  id: string;
  tenantId: string;
  productId: string;
  branchId: string | null;
  channel: "POS" | "ECOMMERCE";
  price: Prisma.Decimal;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

const tenantId = "tenant-1";
const branchId = "branch-1";
const productId = "product-1";

function price(
  value: number,
  options: Partial<TestPrice> = {},
): TestPrice {
  return {
    id: `price-${value}-${Math.random()}`,
    tenantId,
    productId,
    branchId: null,
    channel: "POS",
    price: new Prisma.Decimal(value),
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    ...options,
  };
}

function createHarness(options: {
  sellingPrice?: number;
  prices?: TestPrice[];
} = {}) {
  const prices = options.prices ?? [];
  const product = {
    id: productId,
    tenantId,
    name: "Test product",
    isActive: true,
    sellingPrice: new Prisma.Decimal(
      options.sellingPrice ?? 3500,
    ),
  };
  const storedCheckouts: any[] = [];

  const tx: any = {
    customer: {
      findFirst: async () => null,
    },
    product: {
      findFirst: async ({ where }: any) =>
        where.id === productId &&
        where.tenantId === tenantId &&
        where.isActive === true
          ? product
          : null,
    },
    productPrice: {
      findFirst: async ({ where }: any) => {
        const now = new Date();
        return (
          prices
            .filter(
              (entry) =>
                entry.tenantId === where.tenantId &&
                entry.productId === where.productId &&
                entry.branchId === where.branchId &&
                entry.channel === where.channel &&
                entry.isActive === true &&
                (!entry.startsAt || entry.startsAt <= now) &&
                (!entry.endsAt || entry.endsAt > now),
            )
            .sort(
              (left, right) =>
                (right.startsAt?.getTime() ?? 0) -
                  (left.startsAt?.getTime() ?? 0) ||
                right.createdAt.getTime() -
                  left.createdAt.getTime(),
            )[0] ?? null
        );
      },
    },
    inventory: {
      findUnique: async () => ({
        quantity: new Prisma.Decimal(100),
      }),
    },
    inventoryReservation: {
      aggregate: async () => ({
        _sum: { quantity: new Prisma.Decimal(0) },
      }),
      create: async ({ data }: any) => data,
    },
    posCheckout: {
      create: async ({ data }: any) => {
        const checkout = {
          id: `checkout-${storedCheckouts.length + 1}`,
          ...data,
          items: data.items.create.map(
            (item: any, index: number) => ({
              id: `item-${index + 1}`,
              ...item,
            }),
          ),
        };
        storedCheckouts.push(checkout);
        return checkout;
      },
    },
  };

  const prisma: any = {
    shift: {
      findFirst: async () => ({ id: "shift-1" }),
    },
    $transaction: async (callback: (client: any) => unknown) =>
      callback(tx),
  };
  const pricingService = new PricingService(
    prisma,
    {} as any,
  );
  const service = new PosCheckoutsService(
    prisma,
    pricingService,
  );
  const user: any = {
    sub: "user-1",
    tenantId,
    branchId,
    role: "CASHIER",
  };

  async function createCheckout(
    quantity = 1,
    itemOverrides: Record<string, unknown> = {},
  ) {
    return service.create(
      {
        items: [
          {
            productId,
            quantity,
            ...itemOverrides,
          },
        ],
      },
      user,
    );
  }

  return {
    createCheckout,
    prices,
    product,
    storedCheckouts,
  };
}

test("branch POS override is used by POS checkout", async () => {
  const harness = createHarness({
    prices: [
      price(3600),
      price(3700, { branchId }),
    ],
  });

  const result = await harness.createCheckout();

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3700",
  );
});

test("tenant POS price is used without a branch override", async () => {
  const harness = createHarness({
    prices: [price(3600)],
  });

  const result = await harness.createCheckout();

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3600",
  );
});

test("Product.sellingPrice is the POS checkout fallback", async () => {
  const harness = createHarness({ sellingPrice: 3500 });

  const result = await harness.createCheckout();

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3500",
  );
});

test("tenant ecommerce price does not leak into POS checkout", async () => {
  const harness = createHarness({
    prices: [price(3900, { channel: "ECOMMERCE" })],
  });

  const result = await harness.createCheckout();

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3500",
  );
});

test("branch ecommerce override does not affect POS checkout", async () => {
  const harness = createHarness({
    prices: [
      price(4100, {
        branchId,
        channel: "ECOMMERCE",
      }),
    ],
  });

  const result = await harness.createCheckout();

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3500",
  );
});

test("client cannot inject an authoritative unit price", async () => {
  const harness = createHarness({
    prices: [price(3600, { branchId })],
  });

  const result = await harness.createCheckout(1, {
    unitPrice: 1,
  });

  assert.equal(
    result.checkout.items[0].unitPrice.toString(),
    "3600",
  );
});

test("checkout total uses the resolved POS price", async () => {
  const harness = createHarness({
    prices: [price(3700, { branchId })],
  });

  const result = await harness.createCheckout(2);

  assert.equal(result.checkout.subtotal.toString(), "7400");
  assert.equal(result.checkout.totalAmount.toString(), "7400");
});

test("checkout line persists the resolved unit price", async () => {
  const harness = createHarness({
    prices: [price(3700, { branchId })],
  });

  await harness.createCheckout();

  assert.equal(
    harness.storedCheckouts[0].items[0].unitPrice.toString(),
    "3700",
  );
  assert.equal(
    harness.storedCheckouts[0].items[0].lineTotal.toString(),
    "3700",
  );
});

test("later price changes do not alter an existing checkout", async () => {
  const initialPrice = price(3700, { branchId });
  const harness = createHarness({ prices: [initialPrice] });

  await harness.createCheckout(2);
  initialPrice.isActive = false;
  harness.prices.push(price(4200, { branchId }));

  assert.equal(
    harness.storedCheckouts[0].items[0].unitPrice.toString(),
    "3700",
  );
  assert.equal(
    harness.storedCheckouts[0].totalAmount.toString(),
    "7400",
  );
});
