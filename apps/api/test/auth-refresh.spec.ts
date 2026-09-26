import assert from "node:assert/strict";
import test from "node:test";
import {
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import { AuthService } from "../src/auth/auth.service";
import {
  createAccessTokenJwtOptions,
} from "../src/auth/jwt.config";
import {
  JwtAuthGuard,
} from "../src/auth/jwt-auth.guard";

const accessSecret =
  "unit-test-access-secret";
const refreshSecret =
  "unit-test-refresh-secret";

const originalEnvironment = {
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET,
  JWT_EXPIRES_IN:
    process.env.JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN:
    process.env.JWT_REFRESH_EXPIRES_IN,
};

test.before(() => {
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.JWT_REFRESH_SECRET = refreshSecret;
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
});

test.after(() => {
  for (
    const [name, value]
    of Object.entries(originalEnvironment)
  ) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

const tenant = {
  id: "tenant-1",
  name: "Wellbloom",
  code: "WELLBLOOM",
};

const branch = {
  id: "branch-1",
  name: "Main Branch",
  code: "MAIN",
};

type TestSession = {
  id: string;
  userId: string;
  tokenId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
};

function hashToken(token: string) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

function createHarness(options: {
  isActive?: boolean;
  passwordHash?: string;
  quickPinHash?: string | null;
} = {}) {
  const user = {
    id: "user-1",
    firstName: "Test",
    lastName: "Manager",
    email: "manager@example.test",
    passwordHash:
      options.passwordHash ?? "unused",
    quickPinHash:
      options.quickPinHash ?? null,
    role: "MANAGER",
    isActive: options.isActive ?? true,
    tenantId: tenant.id,
    tenant,
    branchId: branch.id,
    branch,
  };
  const state = {
    sessions: [] as TestSession[],
    auditLogs: [] as any[],
    user,
  };

  const auditService: any = {
    create: async (input: any) => {
      state.auditLogs.push(input);
      return input;
    },
    createWithTx: async (
      _tx: any,
      input: any,
    ) => {
      state.auditLogs.push(input);
      return input;
    },
  };

  const refreshTokenSession = {
    create: async ({ data }: any) => {
      const session: TestSession = {
        id: `session-${state.sessions.length + 1}`,
        userId: data.userId,
        tokenId: data.tokenId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        replacedById: null,
      };

      state.sessions.push(session);
      return session;
    },
    findUnique: async ({ where }: any) =>
      state.sessions.find(
        (session) =>
          session.tokenId === where.tokenId,
      ) ?? null,
    updateMany: async ({ where, data }: any) => {
      const matches = state.sessions.filter(
        (session) =>
          (!where.id || session.id === where.id) &&
          (!where.tokenId ||
            session.tokenId === where.tokenId) &&
          (!where.userId ||
            session.userId === where.userId) &&
          (!where.tokenHash ||
            session.tokenHash === where.tokenHash) &&
          (where.revokedAt !== null ||
            session.revokedAt === null) &&
          (!where.expiresAt?.gt ||
            session.expiresAt > where.expiresAt.gt),
      );

      for (const session of matches) {
        Object.assign(session, data);
      }

      return {
        count: matches.length,
      };
    },
    update: async ({ where, data }: any) => {
      const session = state.sessions.find(
        (candidate) =>
          candidate.id === where.id,
      );

      if (!session) {
        throw new Error("Test session missing");
      }

      Object.assign(session, data);
      return session;
    },
  };

  const prisma: any = {
    tenant: {
      findUnique: async () => tenant,
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (
          where.id &&
          where.id !== user.id
        ) {
          return null;
        }

        return user;
      },
      findFirst: async ({ where }: any) => {
        if (
          where.id !== user.id ||
          where.tenantId !== user.tenantId ||
          where.isActive !== user.isActive
        ) {
          return null;
        }

        return user;
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== user.id ||
          where.tenantId !== user.tenantId ||
          where.isActive !== user.isActive
        ) {
          return { count: 0 };
        }

        Object.assign(user, data);
        return { count: 1 };
      },
    },
    refreshTokenSession,
  };

  prisma.$transaction = async (callback: any) =>
    callback(prisma);

  return {
    service: new AuthService(
      prisma,
      new JwtService(),
      auditService,
    ),
    state,
  };
}

function refreshPayload(tokenId: string) {
  return {
    sub: "user-1",
    tenantId: "tenant-1",
    branchId: "branch-1",
    role: "MANAGER",
    email: "manager@example.test",
    tokenUse: "refresh",
    jti: tokenId,
  } as const;
}

async function persistRefreshToken(
  state: ReturnType<typeof createHarness>["state"],
  options: {
    jwtExpiresIn?: number | string;
    sessionExpiresAt?: Date;
  } = {},
) {
  const tokenId = randomUUID();
  const token = await new JwtService().signAsync(
    refreshPayload(tokenId),
    {
      secret: refreshSecret,
      expiresIn:
        (options.jwtExpiresIn ?? "7d") as any,
    },
  );
  const decoded = new JwtService().decode<{
    exp: number;
  }>(token);

  state.sessions.push({
    id: `session-${state.sessions.length + 1}`,
    userId: state.user.id,
    tokenId,
    tokenHash: hashToken(token),
    expiresAt:
      options.sessionExpiresAt ??
      new Date(decoded.exp * 1000),
    revokedAt: null,
    replacedById: null,
  });

  return token;
}

test("login returns tokens and creates an active hashed refresh session", async () => {
  const passwordHash =
    await bcrypt.hash("correct-password", 4);
  const { service, state } = createHarness({
    passwordHash,
  });

  const result = await service.login({
    tenantCode: "wellbloom",
    email: "manager@example.test",
    password: "correct-password",
  });

  assert.equal(typeof result.accessToken, "string");
  assert.equal(typeof result.refreshToken, "string");
  assert.equal(state.sessions.length, 1);
  assert.equal(state.auditLogs.length, 1);
  assert.equal(
    state.auditLogs[0].action,
    "LOGIN_SUCCESS",
  );
  assert.equal(state.sessions[0].revokedAt, null);
  assert.equal(
    state.sessions[0].tokenHash,
    hashToken(result.refreshToken),
  );
  assert.notEqual(
    state.sessions[0].tokenHash,
    result.refreshToken,
  );
  assert.equal(
    Object.values(state.sessions[0]).includes(
      result.refreshToken,
    ),
    false,
  );

  const jwtService = new JwtService();
  const accessPayload =
    await jwtService.verifyAsync<{
      tokenUse: string;
      tenantId: string;
      branchId: string;
      role: string;
    }>(result.accessToken, {
      secret: accessSecret,
    });
  const refreshTokenPayload =
    await jwtService.verifyAsync<{
      tokenUse: string;
    }>(result.refreshToken, {
      secret: refreshSecret,
    });

  assert.equal(accessPayload.tokenUse, "access");
  assert.equal(
    refreshTokenPayload.tokenUse,
    "refresh",
  );
  assert.equal(accessPayload.tenantId, tenant.id);
  assert.equal(accessPayload.branchId, branch.id);
  assert.equal(accessPayload.role, "MANAGER");
  assert.equal(result.user.pinConfigured, false);
});

test("correct quick PIN unlocks while a wrong PIN remains rejected", async () => {
  const quickPinHash = await bcrypt.hash("2468", 4);
  const { service } = createHarness({ quickPinHash });
  const authenticatedUser = refreshPayload("unused");

  assert.deepEqual(
    await service.verifyPin(authenticatedUser, "2468"),
    { success: true },
  );
  await assert.rejects(
    () => service.verifyPin(authenticatedUser, "1111"),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "Invalid PIN",
  );
});

test("missing quick PIN uses the same generic rejection", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () => service.verifyPin(refreshPayload("unused"), "2468"),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "Invalid PIN",
  );
});

test("quick PIN setup verifies the account password and stores only a hash", async () => {
  const passwordHash = await bcrypt.hash("correct-password", 4);
  const { service, state } = createHarness({ passwordHash });
  const authenticatedUser = refreshPayload("unused");

  await assert.rejects(
    () => service.setPin(authenticatedUser, "wrong-password", "2468"),
    UnauthorizedException,
  );
  assert.equal(state.user.quickPinHash, null);

  assert.deepEqual(
    await service.setPin(
      authenticatedUser,
      "correct-password",
      "2468",
    ),
    { success: true },
  );
  assert.notEqual(state.user.quickPinHash, "2468");
  assert.equal(
    await bcrypt.compare("2468", state.user.quickPinHash ?? ""),
    true,
  );
});

test("failed login records a safe audit event", async () => {
  const passwordHash =
    await bcrypt.hash("correct-password", 4);
  const { service, state } = createHarness({
    passwordHash,
  });

  await assert.rejects(
    () => service.login({
      tenantCode: "wellbloom",
      email: "manager@example.test",
      password: "wrong-password",
    }),
    UnauthorizedException,
  );

  assert.deepEqual(state.auditLogs, [
    {
      tenantId: "tenant-1",
      userId: "user-1",
      action: "LOGIN_FAILURE",
      entityType: "USER",
      entityId: "user-1",
      metadata: {
        reason: "INVALID_CREDENTIALS",
      },
    },
  ]);
});

test("valid refresh revokes the old session and creates a new one", async () => {
  const { service, state } = createHarness();
  const originalToken =
    await persistRefreshToken(state);

  const result =
    await service.refresh(originalToken);

  assert.equal(state.sessions.length, 2);
  assert.ok(state.sessions[0].revokedAt);
  assert.equal(
    state.sessions[0].replacedById,
    state.sessions[1].id,
  );
  assert.equal(state.sessions[1].revokedAt, null);
  assert.notEqual(result.refreshToken, originalToken);
  assert.equal(result.user.id, state.user.id);
  assert.equal(
    result.user.tenant.id,
    state.user.tenantId,
  );
  assert.equal(
    result.user.branch?.id,
    state.user.branchId,
  );
});

test("reused rotated refresh token is rejected", async () => {
  const { service, state } = createHarness();
  const originalToken =
    await persistRefreshToken(state);

  await service.refresh(originalToken);

  await assert.rejects(
    () => service.refresh(originalToken),
    UnauthorizedException,
  );
});

test("new rotated refresh token succeeds", async () => {
  const { service, state } = createHarness();
  const originalToken =
    await persistRefreshToken(state);
  const firstRotation =
    await service.refresh(originalToken);

  const secondRotation =
    await service.refresh(
      firstRotation.refreshToken,
    );

  assert.equal(state.sessions.length, 3);
  assert.ok(state.sessions[1].revokedAt);
  assert.equal(state.sessions[2].revokedAt, null);
  assert.notEqual(
    secondRotation.refreshToken,
    firstRotation.refreshToken,
  );
});

test("invalid refresh token is rejected", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () => service.refresh("not-a-jwt"),
    UnauthorizedException,
  );
});

test("expired JWT refresh token is rejected", async () => {
  const { service, state } = createHarness();
  const expiredToken =
    await persistRefreshToken(state, {
      jwtExpiresIn: -1,
    });

  await assert.rejects(
    () => service.refresh(expiredToken),
    UnauthorizedException,
  );
});

test("expired database session cannot refresh", async () => {
  const { service, state } = createHarness();
  const token = await persistRefreshToken(
    state,
    {
      sessionExpiresAt: new Date(
        Date.now() - 1000,
      ),
    },
  );

  await assert.rejects(
    () => service.refresh(token),
    UnauthorizedException,
  );
});

test("inactive user cannot refresh", async () => {
  const { service, state } = createHarness({
    isActive: false,
  });
  const token = await persistRefreshToken(state);

  await assert.rejects(
    () => service.refresh(token),
    UnauthorizedException,
  );
});

test("logout revokes a refresh token and prevents reuse", async () => {
  const { service, state } = createHarness();
  const token = await persistRefreshToken(state);

  const result = await service.logout(token);

  assert.equal(result.success, true);
  assert.ok(state.sessions[0].revokedAt);
  await assert.rejects(
    () => service.refresh(token),
    UnauthorizedException,
  );
});

test("logout-all revokes every active user session", async () => {
  const { service, state } = createHarness();
  await persistRefreshToken(state);
  await persistRefreshToken(state);

  const result =
    await service.logoutAll(state.user.id);

  assert.equal(result.success, true);
  assert.equal(
    state.sessions.every(
      (session) => session.revokedAt,
    ),
    true,
  );
});

test("access token cannot be used as a refresh token", async () => {
  const accessToken =
    await new JwtService().signAsync(
      {
        ...refreshPayload(randomUUID()),
        tokenUse: "access",
      },
      {
        secret: accessSecret,
        expiresIn: "1d",
      },
    );
  const { service } = createHarness();

  await assert.rejects(
    () => service.refresh(accessToken),
    UnauthorizedException,
  );
});

test("refresh token cannot be used as an access token", async () => {
  const { state } = createHarness();
  const refreshToken =
    await persistRefreshToken(state);
  const jwtService = new JwtService(
    createAccessTokenJwtOptions(),
  );
  const guard = new JwtAuthGuard(jwtService);
  const request = {
    headers: {
      authorization:
        `Bearer ${refreshToken}`,
    },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;

  await assert.rejects(
    () => guard.canActivate(context),
    UnauthorizedException,
  );
});
