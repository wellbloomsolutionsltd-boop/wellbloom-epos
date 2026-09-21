import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { PricingService } from "../src/pricing/pricing.service";

function createPricingService(options: {
  tenantId?: string;
  prices?: any[];
}) {
  const tenantId = options.tenantId ?? "tenant-1";
  const prices = options.prices ?? [];
  const db: any = {
    product: {
      findFirst: async ({ where }: any) =>
        where.tenantId === tenantId &&
        where.id === "product-1"
          ? {
              id: "product-1",
              name: "Test product",
              sellingPrice: new Prisma.Decimal(3500),
            }
          : null,
    },
    productPrice: {
      findFirst: async ({ where, orderBy }: any) => {
        const now = new Date();
        const matches = prices.filter((price) =>
          price.tenantId === where.tenantId &&
          price.productId === where.productId &&
          price.branchId === where.branchId &&
          price.channel === where.channel &&
          price.isActive === true &&
          (!price.startsAt || price.startsAt <= now) &&
          (!price.endsAt || price.endsAt > now),
        );

        return matches.sort((left, right) =>
          (right.startsAt?.getTime() ?? 0) -
          (left.startsAt?.getTime() ?? 0) ||
          right.createdAt.getTime() - left.createdAt.getTime(),
        )[0] ?? null;
      },
    },
  };

  return new PricingService(db);
}

const price = (
  value: number,
  options: Record<string, unknown> = {},
) => ({
  id: `price-${value}-${Math.random()}`,
  tenantId: "tenant-1",
  productId: "product-1",
  branchId: null,
  channel: "POS",
  price: new Prisma.Decimal(value),
  isActive: true,
  createdAt: new Date(),
  ...options,
});

test("no ProductPrice uses Product.sellingPrice", async () => {
  const service = createPricingService({});
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3500");
  assert.equal(result.source, "PRODUCT_DEFAULT");
});

test("tenant POS price is used", async () => {
  const service = createPricingService({
    prices: [price(3600)],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3600");
});

test("ecommerce price is used for ecommerce channel", async () => {
  const service = createPricingService({
    prices: [price(3800, { channel: "ECOMMERCE" })],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "ECOMMERCE",
  });
  assert.equal(result.price.toString(), "3800");
});

test("POS and ecommerce prices resolve independently", async () => {
  const service = createPricingService({
    prices: [
      price(3600),
      price(3800, { channel: "ECOMMERCE" }),
    ],
  });
  const pos = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  const ecommerce = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "ECOMMERCE",
  });
  assert.equal(pos.price.toString(), "3600");
  assert.equal(ecommerce.price.toString(), "3800");
});

test("branch POS override wins", async () => {
  const service = createPricingService({
    prices: [
      price(3600),
      price(3700, { branchId: "branch-1" }),
    ],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    branchId: "branch-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3700");
});

test("different branch uses tenant-wide price", async () => {
  const service = createPricingService({
    prices: [
      price(3600),
      price(3700, { branchId: "branch-1" }),
    ],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    branchId: "branch-2",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3600");
});

test("future price is ignored", async () => {
  const service = createPricingService({
    prices: [
      price(3900, {
        startsAt: new Date(Date.now() + 60_000),
      }),
    ],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3500");
});

test("expired price is ignored", async () => {
  const service = createPricingService({
    prices: [
      price(3900, {
        endsAt: new Date(Date.now() - 60_000),
      }),
    ],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3500");
});

test("wrong tenant price is never used", async () => {
  const service = createPricingService({
    prices: [price(3900, { tenantId: "tenant-2" })],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
  });
  assert.equal(result.price.toString(), "3500");
});

test("frontend-provided price is ignored by resolver", async () => {
  const service = createPricingService({
    prices: [price(3600)],
  });
  const result = await service.resolveProductPrice({
    tenantId: "tenant-1",
    productId: "product-1",
    channel: "POS",
    ...( { unitPrice: 1 } as any),
  });
  assert.equal(result.price.toString(), "3600");
});
