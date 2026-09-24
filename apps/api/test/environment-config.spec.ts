import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEnvironment,
} from "../src/environment.config";

const validEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL:
    "postgresql://postgres:password@localhost:5432/wellbloom_pos",
  JWT_SECRET: "access-secret-for-tests",
  JWT_REFRESH_SECRET: "refresh-secret-for-tests",
  JWT_EXPIRES_IN: "1d",
  JWT_REFRESH_EXPIRES_IN: "7d",
};

test("valid local environment resolves safe defaults", () => {
  const result = validateEnvironment(validEnvironment);

  assert.equal(
    result.jwtAccessSecret,
    "access-secret-for-tests",
  );
  assert.deepEqual(
    result.corsOrigins,
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
  );
});

test("missing required environment blocks startup", () => {
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      DATABASE_URL: "",
    }),
    /DATABASE_URL/,
  );

  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      JWT_SECRET: "",
    }),
    /JWT_ACCESS_SECRET \(or JWT_SECRET\)/,
  );
});

test("JWT access and refresh secrets must differ", () => {
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      JWT_REFRESH_SECRET:
        validEnvironment.JWT_SECRET,
    }),
    /must be different/,
  );
});

test("invalid JWT expiry and CORS values block startup", () => {
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      JWT_EXPIRES_IN: "tomorrow",
    }),
    /JWT_EXPIRES_IN/,
  );

  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      CORS_ORIGIN: "*",
    }),
    /Wildcard CORS origins/,
  );
});
