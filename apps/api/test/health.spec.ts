import assert from "node:assert/strict";
import test from "node:test";
import {
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  HealthController,
} from "../src/health/health.controller";

test("health check reports an available database", async () => {
  const prisma: any = {
    $queryRaw: async () => [
      {
        "?column?": 1,
      },
    ],
  };
  const controller = new HealthController(
    prisma,
  );

  const result = await controller.check();

  assert.equal(result.status, "ok");
  assert.equal(result.database, "ok");
  assert.equal(
    Number.isNaN(
      Date.parse(result.timestamp),
    ),
    false,
  );
});

test("health check rejects an unavailable database", async () => {
  const prisma: any = {
    $queryRaw: async () => {
      throw new Error(
        "internal database detail",
      );
    },
  };
  const controller = new HealthController(
    prisma,
  );

  await assert.rejects(
    () => controller.check(),
    ServiceUnavailableException,
  );
});
