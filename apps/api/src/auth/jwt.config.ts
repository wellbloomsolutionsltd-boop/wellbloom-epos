import type {
  JwtModuleOptions,
} from "@nestjs/jwt";

type JwtExpiry = NonNullable<
  NonNullable<JwtModuleOptions["signOptions"]>["expiresIn"]
>;

export type JwtEnvironmentConfig = {
  accessSecret: string;
  accessExpiresIn: JwtExpiry;
  refreshSecret: string;
  refreshExpiresIn: JwtExpiry;
};

const requiredJwtEnvironmentVariables = [
  "JWT_REFRESH_SECRET",
] as const;

export function getJwtEnvironmentConfig(): JwtEnvironmentConfig {
  const accessSecret =
    process.env.JWT_ACCESS_SECRET?.trim() ??
    process.env.JWT_SECRET?.trim();
  const missing: string[] =
    requiredJwtEnvironmentVariables.filter(
      (name) => !process.env[name]?.trim(),
    );

  if (!accessSecret) {
    missing.unshift("JWT_ACCESS_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required JWT environment variables: ${missing.join(", ")}`,
    );
  }

  if (
    accessSecret ===
    process.env.JWT_REFRESH_SECRET?.trim()
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different",
    );
  }

  return {
    accessSecret: accessSecret!,
    accessExpiresIn: (
      process.env.JWT_EXPIRES_IN ?? "1d"
    ) as JwtExpiry,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiresIn: (
      process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"
    ) as JwtExpiry,
  };
}

export function createAccessTokenJwtOptions(): JwtModuleOptions {
  const config = getJwtEnvironmentConfig();

  return {
    secret: config.accessSecret,
    signOptions: {
      expiresIn: config.accessExpiresIn,
    },
  };
}
