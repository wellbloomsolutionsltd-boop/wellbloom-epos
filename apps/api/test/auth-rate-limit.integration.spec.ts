import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import {
  Controller,
  Get,
  Module,
} from "@nestjs/common";
import {
  APP_GUARD,
} from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import {
  JwtModule,
} from "@nestjs/jwt";
import {
  ThrottlerGuard,
  ThrottlerModule,
} from "@nestjs/throttler";
import {
  configureApiRuntime,
} from "../src/api-runtime";
import {
  AuthController,
} from "../src/auth/auth.controller";
import {
  AuthService,
} from "../src/auth/auth.service";
import {
  JwtAuthGuard,
} from "../src/auth/jwt-auth.guard";

const authService = {
  login: async () => ({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
  }),
  refresh: async () => ({
    accessToken: "refreshed-access-token",
    refreshToken: "refreshed-refresh-token",
  }),
  logout: async () => ({ success: true }),
  logoutAll: async () => ({ success: true }),
};

class RateLimitProbeController {
  check() {
    return { status: "ok" };
  }
}

Get()(
  RateLimitProbeController.prototype,
  "check",
  Object.getOwnPropertyDescriptor(
    RateLimitProbeController.prototype,
    "check",
  )!,
);
Controller("rate-limit-probe")(
  RateLimitProbeController,
);

@Module({
  imports: [
    JwtModule.register({
      secret: "rate-limit-test-secret",
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: 120,
        },
      ],
    }),
  ],
  controllers: [
    AuthController,
    RateLimitProbeController,
  ],
  providers: [
    {
      provide: AuthService,
      useValue: authService,
    },
    JwtAuthGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
class AuthRateLimitModule {}

async function createRateLimitApp() {
  const app = await NestFactory.create(
    AuthRateLimitModule,
    {
      logger: false,
      bodyParser: false,
      abortOnError: false,
    },
  );

  configureApiRuntime(app, {
    NODE_ENV: "development",
  });

  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer()
    .address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("normal login succeeds before the auth rate limit is enforced", async () => {
  const { app, baseUrl } =
    await createRateLimitApp();
  const url = `${baseUrl}/auth/login`;

  try {
    for (let attempt = 1; attempt <= 8; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantCode: "wellbloom",
          email: "user@example.com",
          password: "correct-password",
        }),
      });

      assert.equal(response.status, 201);
    }

    const limited = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantCode: "wellbloom",
        email: "user@example.com",
        password: "correct-password",
      }),
    });

    assert.equal(limited.status, 429);
  } finally {
    await app.close();
  }
});

test("general rate limit activates after 120 requests", async () => {
  const { app, baseUrl } =
    await createRateLimitApp();
  const url = `${baseUrl}/rate-limit-probe`;

  try {
    for (let attempt = 1; attempt <= 120; attempt++) {
      const response = await fetch(url);

      assert.equal(response.status, 200);
    }

    const limited = await fetch(url);

    assert.equal(limited.status, 429);
  } finally {
    await app.close();
  }
});
