import type {
  JwtModuleOptions,
} from "@nestjs/jwt";
import {
  resolveCorsOrigins,
} from "./cors.config";

type JwtExpiry = NonNullable<
  NonNullable<JwtModuleOptions["signOptions"]>["expiresIn"]
>;

export type ValidatedEnvironment = {
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: JwtExpiry;
  jwtRefreshExpiresIn: JwtExpiry;
  corsOrigins: string[];
};

const JWT_EXPIRY_PATTERN =
  /^\d+(?:ms|s|m|h|d|w|y)$/i;

function requiredValue(
  environment: NodeJS.ProcessEnv,
  name: string,
) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function validateJwtExpiry(
  value: string,
  name: string,
) {
  if (!JWT_EXPIRY_PATTERN.test(value)) {
    throw new Error(
      `${name} must be a duration such as 15m, 1h, or 7d`,
    );
  }

  return value as JwtExpiry;
}

export function validateEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ValidatedEnvironment {
  const databaseUrl = requiredValue(
    environment,
    "DATABASE_URL",
  );

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL connection URL",
    );
  }

  if (
    parsedDatabaseUrl.protocol !== "postgresql:" &&
    parsedDatabaseUrl.protocol !== "postgres:"
  ) {
    throw new Error(
      "DATABASE_URL must use the PostgreSQL protocol",
    );
  }

  const jwtAccessSecret =
    environment.JWT_ACCESS_SECRET?.trim() ??
    environment.JWT_SECRET?.trim();

  if (!jwtAccessSecret) {
    throw new Error(
      "Missing required environment variable: JWT_ACCESS_SECRET (or JWT_SECRET)",
    );
  }

  const jwtRefreshSecret = requiredValue(
    environment,
    "JWT_REFRESH_SECRET",
  );

  if (jwtAccessSecret === jwtRefreshSecret) {
    throw new Error(
      "JWT access and refresh secrets must be different",
    );
  }

  const jwtExpiresIn = validateJwtExpiry(
    environment.JWT_EXPIRES_IN?.trim() || "1d",
    "JWT_EXPIRES_IN",
  );
  const jwtRefreshExpiresIn = validateJwtExpiry(
    environment.JWT_REFRESH_EXPIRES_IN?.trim() || "7d",
    "JWT_REFRESH_EXPIRES_IN",
  );

  return {
    databaseUrl,
    jwtAccessSecret,
    jwtRefreshSecret,
    jwtExpiresIn,
    jwtRefreshExpiresIn,
    corsOrigins: resolveCorsOrigins(environment),
  };
}
