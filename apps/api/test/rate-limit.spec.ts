import assert from "node:assert/strict";
import test from "node:test";
import { APP_GUARD } from "@nestjs/core";
import {
  getOptionsToken,
  ThrottlerGuard,
  ThrottlerModule,
} from "@nestjs/throttler";
import { AppModule } from "../src/app.module";
import {
  AuthController,
} from "../src/auth/auth.controller";
import {
  PaymentsController,
} from "../src/payments/payments.controller";

test("global throttling is configured for 120 requests per minute", () => {
  const imports = Reflect.getMetadata(
    "imports",
    AppModule,
  ) as Array<{
    module?: unknown;
    providers?: Array<{
      provide?: unknown;
      useValue?: unknown;
    }>;
  }>;
  const throttlerImport = imports.find(
    (entry) =>
      entry.module === ThrottlerModule,
  );
  const optionsProvider =
    throttlerImport?.providers?.find(
      (provider) =>
        provider.provide === getOptionsToken(),
    );

  assert.deepEqual(
    optionsProvider?.useValue,
    {
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: 120,
        },
      ],
    },
  );
});

test("ThrottlerGuard is registered globally", () => {
  const providers = Reflect.getMetadata(
    "providers",
    AppModule,
  ) as Array<{
    provide?: unknown;
    useClass?: unknown;
  }>;

  assert.ok(
    providers.some(
      (provider) =>
        provider.provide === APP_GUARD &&
        provider.useClass === ThrottlerGuard,
    ),
  );
});

test("login is limited to eight requests per minute", () => {
  assert.equal(
    Reflect.getMetadata(
      "THROTTLER:LIMITdefault",
      AuthController.prototype.login,
    ),
    8,
  );
  assert.equal(
    Reflect.getMetadata(
      "THROTTLER:TTLdefault",
      AuthController.prototype.login,
    ),
    60_000,
  );
});

test("refresh is limited to twelve requests per minute", () => {
  assert.equal(
    Reflect.getMetadata(
      "THROTTLER:LIMITdefault",
      AuthController.prototype.refresh,
    ),
    12,
  );
  assert.equal(
    Reflect.getMetadata(
      "THROTTLER:TTLdefault",
      AuthController.prototype.refresh,
    ),
    60_000,
  );
});

test("M-Pesa callbacks are exempt from interactive-user throttling", () => {
  assert.equal(
    Reflect.getMetadata(
      "THROTTLER:SKIPdefault",
      PaymentsController.prototype.mpesaCallback,
    ),
    true,
  );
});
