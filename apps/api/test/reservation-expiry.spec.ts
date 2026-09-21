import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { OrdersService } from "../src/orders/orders.service";

type ReservationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "RELEASED"
  | "EXPIRED";

type FixtureOptions = {
  reservationStatus?: ReservationStatus;
  expired?: boolean;
  orderStatus?: string;
};

function createFixture(
  options: FixtureOptions = {},
) {
  const now = new Date();
  const state = {
    reservation: {
      id: "reservation-1",
      branchId: "branch-1",
      productId: "product-1",
      quantity: new Prisma.Decimal(1),
      status:
        options.reservationStatus ?? "ACTIVE",
      expiresAt: options.expired
        ? new Date(now.getTime() - 60_000)
        : new Date(now.getTime() + 60_000),
    },
    order: {
      id: "order-1",
      status:
        options.orderStatus ?? "AWAITING_PAYMENT",
      reservationExpiresAt: options.expired
        ? new Date(now.getTime() - 60_000)
        : new Date(now.getTime() + 60_000),
    },
    inventory: {
      quantity: new Prisma.Decimal(5),
      reservedQty: new Prisma.Decimal(1),
    },
    reservationUpdates: 0,
    inventoryReleases: 0,
    orderUpdates: 0,
  };

  const prisma: any = {
    order: {
      findMany: async ({ where }: any) => {
        const expired =
          state.order.reservationExpiresAt <= now;
        const hasActiveReservation =
          state.reservation.status === "ACTIVE";

        if (where.reservations?.none) {
          return state.order.status ===
            "AWAITING_PAYMENT" &&
            expired &&
            !hasActiveReservation
            ? [{ id: state.order.id }]
            : [];
        }

        return state.order.status ===
          "AWAITING_PAYMENT" &&
          expired &&
          hasActiveReservation
          ? [
              {
                ...state.order,
                branchId: state.reservation.branchId,
                reservations: [
                  {
                    ...state.reservation,
                  },
                ],
              },
            ]
          : [];
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== state.order.id ||
          state.order.status !== where.status
        ) {
          return { count: 0 };
        }

        Object.assign(state.order, data);
        state.orderUpdates += 1;
        return { count: 1 };
      },
    },
    inventoryReservation: {
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== state.reservation.id ||
          state.reservation.status !== where.status
        ) {
          return { count: 0 };
        }

        Object.assign(state.reservation, data);
        state.reservationUpdates += 1;
        return { count: 1 };
      },
    },
    $executeRaw: async () => {
      if (
        state.inventory.reservedQty.lessThan(
          state.reservation.quantity,
        )
      ) {
        return 0;
      }

      state.inventory.reservedQty =
        state.inventory.reservedQty.sub(
          state.reservation.quantity,
        );
      state.inventoryReleases += 1;
      return 1;
    },
    $transaction: async (operation: any) =>
      operation(prisma),
  };

  return {
    state,
    service: new OrdersService(prisma),
  };
}

test("expired ACTIVE reservation expires and releases reservedQty", async () => {
  const fixture = createFixture({ expired: true });

  const result =
    await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "EXPIRED");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "0");
  assert.equal(fixture.state.order.status, "FAILED");
  assert.equal(fixture.state.orderUpdates, 1);
  assert.equal(result.releasedCount, 1);
});

test("non-expired ACTIVE reservation remains active", async () => {
  const fixture = createFixture();

  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "ACTIVE");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "1");
  assert.equal(fixture.state.order.status, "AWAITING_PAYMENT");
});

test("CONSUMED reservation is ignored", async () => {
  const fixture = createFixture({
    expired: true,
    reservationStatus: "CONSUMED",
  });

  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "CONSUMED");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "1");
  assert.equal(fixture.state.inventoryReleases, 0);
});

test("RELEASED reservation is ignored", async () => {
  const fixture = createFixture({
    expired: true,
    reservationStatus: "RELEASED",
  });

  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "RELEASED");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "1");
  assert.equal(fixture.state.inventoryReleases, 0);
});

test("already EXPIRED reservation is ignored", async () => {
  const fixture = createFixture({
    expired: true,
    reservationStatus: "EXPIRED",
  });

  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "EXPIRED");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "1");
  assert.equal(fixture.state.inventoryReleases, 0);
});

test("duplicate cleanup does not decrement reservedQty twice", async () => {
  const fixture = createFixture({ expired: true });

  await fixture.service.releaseExpiredReservations();
  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.reservation.status, "EXPIRED");
  assert.equal(fixture.state.inventory.reservedQty.toString(), "0");
  assert.equal(fixture.state.inventoryReleases, 1);
  assert.equal(fixture.state.orderUpdates, 1);
});

test("expired order becomes FAILED with failed payment status", async () => {
  const fixture = createFixture({ expired: true });

  await fixture.service.releaseExpiredReservations();

  assert.equal(fixture.state.order.status, "FAILED");
});

test("physical quantity never changes during expiry cleanup", async () => {
  const fixture = createFixture({ expired: true });
  const quantityBefore = fixture.state.inventory.quantity.toString();

  await fixture.service.releaseExpiredReservations();

  assert.equal(
    fixture.state.inventory.quantity.toString(),
    quantityBefore,
  );
});
