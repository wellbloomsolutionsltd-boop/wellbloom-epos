import assert from "node:assert/strict";
import test from "node:test";
import { JwtService } from "@nestjs/jwt";
import {
  createAccessTokenJwtOptions,
  getJwtEnvironmentConfig,
} from "../src/auth/jwt.config";

const jwtEnvironmentNames = [
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "JWT_REFRESH_SECRET",
  "JWT_REFRESH_EXPIRES_IN",
] as const;

function withJwtEnvironment(
  values: Partial<Record<
    (typeof jwtEnvironmentNames)[number],
    string
  >>,
  callback: () => void,
) {
  const original = Object.fromEntries(
    jwtEnvironmentNames.map((name) => [
      name,
      process.env[name],
    ]),
  );

  try {
    for (const name of jwtEnvironmentNames) {
      const value = values[name];

      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    callback();
  } finally {
    for (const name of jwtEnvironmentNames) {
      const value = original[name];

      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("JWT configuration reads access and refresh settings", () => {
  withJwtEnvironment(
    {
      JWT_SECRET: "test-access-secret",
      JWT_EXPIRES_IN: "2h",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      JWT_REFRESH_EXPIRES_IN: "14d",
    },
    () => {
      const config = getJwtEnvironmentConfig();

      assert.equal(
        config.accessSecret,
        "test-access-secret",
      );
      assert.equal(config.accessExpiresIn, "2h");
      assert.equal(
        config.refreshSecret,
        "test-refresh-secret",
      );
      assert.equal(config.refreshExpiresIn, "14d");
    },
  );
});

test("JWT configuration uses the documented expiry defaults", () => {
  withJwtEnvironment(
    {
      JWT_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    },
    () => {
      const config = getJwtEnvironmentConfig();

      assert.equal(config.accessExpiresIn, "1d");
      assert.equal(config.refreshExpiresIn, "7d");
    },
  );
});

test("access tokens are signed and verified with JWT_SECRET", () => {
  withJwtEnvironment(
    {
      JWT_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    },
    () => {
      const jwtService = new JwtService(
        createAccessTokenJwtOptions(),
      );
      const token = jwtService.sign({
        sub: "user-1",
      });
      const payload = jwtService.verify<{
        sub: string;
      }>(token);

      assert.equal(payload.sub, "user-1");
    },
  );
});

test("JWT configuration rejects missing secrets", () => {
  withJwtEnvironment({}, () => {
    assert.throws(
      () => getJwtEnvironmentConfig(),
      /Missing required JWT environment variables: JWT_SECRET, JWT_REFRESH_SECRET/,
    );
  });
});
