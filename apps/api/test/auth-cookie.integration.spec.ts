import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import {
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import {
  NestFactory,
} from "@nestjs/core";
import {
  JwtModule,
} from "@nestjs/jwt";
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
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from "../src/auth/refresh-cookie";

const user = {
  id: "user-1",
  firstName: "Test",
  lastName: "Manager",
  email: "manager@example.test",
  role: "MANAGER",
  tenant: {
    id: "tenant-1",
    name: "Wellbloom",
    code: "WELLBLOOM",
  },
  branch: {
    id: "branch-1",
    name: "Main Branch",
    code: "MAIN",
  },
};

function createAuthService() {
  let activeRefreshToken:
    | string
    | null = "login-refresh-token";
  const calls = {
    refresh: [] as string[],
    logout: [] as string[],
  };

  return {
    calls,
    service: {
      login: async () => ({
        accessToken: "login-access-token",
        refreshToken: "login-refresh-token",
        user,
      }),
      refresh: async (
        refreshToken: string,
      ) => {
        calls.refresh.push(refreshToken);

        if (
          refreshToken !==
          activeRefreshToken
        ) {
          throw new UnauthorizedException(
            "Invalid or expired refresh token",
          );
        }

        activeRefreshToken =
          "rotated-refresh-token";

        return {
          accessToken:
            "rotated-access-token",
          refreshToken:
            activeRefreshToken,
          user,
        };
      },
      logout: async (
        refreshToken: string,
      ) => {
        calls.logout.push(refreshToken);

        if (
          refreshToken !==
          activeRefreshToken
        ) {
          throw new UnauthorizedException(
            "Invalid or expired refresh token",
          );
        }

        activeRefreshToken = null;
        return { success: true };
      },
      logoutAll: async () => ({
        success: true,
      }),
    },
  };
}

async function withAuthApp(
  callback: (
    baseUrl: string,
    auth: ReturnType<
      typeof createAuthService
    >,
  ) => Promise<void>,
) {
  const auth = createAuthService();

  class AuthCookieTestModule {}

  Module({
    imports: [
      JwtModule.register({
        secret: "cookie-test-access-secret",
      }),
    ],
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: auth.service,
      },
      JwtAuthGuard,
    ],
  })(AuthCookieTestModule);

  const app = await NestFactory.create(
    AuthCookieTestModule,
    {
      logger: false,
      bodyParser: false,
      abortOnError: false,
    },
  );

  configureApiRuntime(app, {
    NODE_ENV: "development",
    CORS_ORIGIN:
      "http://localhost:3000,http://127.0.0.1:3000",
  });

  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer()
    .address() as AddressInfo;

  try {
    await callback(
      `http://127.0.0.1:${address.port}`,
      auth,
    );
  } finally {
    await app.close();
  }
}

function cookiePair(
  response: Response,
) {
  const setCookie =
    response.headers.get("set-cookie");

  assert.ok(setCookie);
  return setCookie.split(";", 1)[0];
}

test("login uses an HttpOnly refresh cookie and omits the refresh token from JSON", async () => {
  await withAuthApp(async (
    baseUrl,
  ) => {
    const response = await fetch(
      `${baseUrl}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Origin:
            "http://localhost:3000",
        },
        body: JSON.stringify({
          tenantCode: "wellbloom",
          email:
            "manager@example.test",
          password:
            "correct-password",
        }),
      },
    );
    const body = await response.json();
    const setCookie =
      response.headers.get("set-cookie") ??
      "";

    assert.equal(response.status, 201);
    assert.equal(
      body.accessToken,
      "login-access-token",
    );
    assert.deepEqual(body.user, user);
    assert.equal(
      "refreshToken" in body,
      false,
    );
    assert.match(
      setCookie,
      new RegExp(
        `^${REFRESH_COOKIE_NAME}=login-refresh-token`,
      ),
    );
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/auth/i);
    assert.match(setCookie, /Max-Age=604800/i);
    assert.doesNotMatch(
      setCookie,
      /;\s*Secure/i,
    );
    assert.equal(
      response.headers.get(
        "access-control-allow-origin",
      ),
      "http://localhost:3000",
    );
    assert.equal(
      response.headers.get(
        "access-control-allow-credentials",
      ),
      "true",
    );
  });
});

test("refresh reads and rotates the cookie while rejecting missing and reused cookies", async () => {
  await withAuthApp(async (
    baseUrl,
    auth,
  ) => {
    const missing = await fetch(
      `${baseUrl}/auth/refresh`,
      { method: "POST" },
    );

    assert.equal(missing.status, 401);

    const login = await fetch(
      `${baseUrl}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          tenantCode: "wellbloom",
          email:
            "manager@example.test",
          password:
            "correct-password",
        }),
      },
    );
    const originalCookie =
      cookiePair(login);
    const refreshed = await fetch(
      `${baseUrl}/auth/refresh`,
      {
        method: "POST",
        headers: {
          Cookie: originalCookie,
        },
      },
    );
    const body = await refreshed.json();
    const rotatedCookie =
      cookiePair(refreshed);

    assert.equal(refreshed.status, 201);
    assert.equal(
      body.accessToken,
      "rotated-access-token",
    );
    assert.deepEqual(body.user, user);
    assert.equal(
      "refreshToken" in body,
      false,
    );
    assert.notEqual(
      rotatedCookie,
      originalCookie,
    );
    assert.deepEqual(
      auth.calls.refresh,
      ["login-refresh-token"],
    );

    const reused = await fetch(
      `${baseUrl}/auth/refresh`,
      {
        method: "POST",
        headers: {
          Cookie: originalCookie,
        },
      },
    );

    assert.equal(reused.status, 401);
  });
});

test("logout revokes the cookie session and clears the browser cookie", async () => {
  await withAuthApp(async (
    baseUrl,
    auth,
  ) => {
    const login = await fetch(
      `${baseUrl}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          tenantCode: "wellbloom",
          email:
            "manager@example.test",
          password:
            "correct-password",
        }),
      },
    );
    const cookie = cookiePair(login);
    const logout = await fetch(
      `${baseUrl}/auth/logout`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
        },
      },
    );
    const cleared =
      logout.headers.get("set-cookie") ??
      "";

    assert.equal(logout.status, 201);
    assert.deepEqual(
      auth.calls.logout,
      ["login-refresh-token"],
    );
    assert.match(
      cleared,
      new RegExp(
        `^${REFRESH_COOKIE_NAME}=`,
      ),
    );
    assert.match(cleared, /Expires=/i);
    assert.match(cleared, /HttpOnly/i);
    assert.match(cleared, /Path=\/auth/i);

    const revoked = await fetch(
      `${baseUrl}/auth/refresh`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
        },
      },
    );

    assert.equal(revoked.status, 401);
  });
});

test("refresh cookie Secure mode is explicitly environment-controlled", () => {
  assert.equal(
    refreshCookieOptions({
      AUTH_COOKIE_SECURE: "false",
    }).secure,
    false,
  );
  assert.equal(
    refreshCookieOptions({
      AUTH_COOKIE_SECURE: "true",
    }).secure,
    true,
  );
  assert.throws(
    () => refreshCookieOptions({
      AUTH_COOKIE_SECURE: "sometimes",
    }),
    /AUTH_COOKIE_SECURE must be true or false/,
  );
});
