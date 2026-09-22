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
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN:
    process.env.JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN:
    process.env.JWT_REFRESH_EXPIRES_IN,
};

test.before(() => {
  process.env.JWT_SECRET = accessSecret;
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
} = {}) {
  const user = {
    id: "user-1",
    firstName: "Test",
    lastName: "Manager",
    email: "manager@example.test",
    passwordHash:
      options.passwordHash ?? "unused",
    role: "MANAGER",
    isActive: options.isActive ?? true,
    tenantId: tenant.id,
    tenant,
    branchId: branch.id,
    branch,
  };
  const state = {
    sessions: [] as TestSession[],
    user,
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
    },
    refreshTokenSession,
  };

  prisma.$transaction = async (callback: any) =>
    callback(prisma);

  return {
    service: new AuthService(
      prisma,
      new JwtService(),
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
