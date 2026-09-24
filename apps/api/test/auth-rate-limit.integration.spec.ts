import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import {
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
  controllers: [AuthController],
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

test("normal login succeeds before the auth rate limit is enforced", async () => {
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
  const url =
    `http://127.0.0.1:${address.port}/auth/login`;

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
