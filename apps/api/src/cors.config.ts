import type {
  CorsOptions,
  CustomOrigin,
} from "@nestjs/common/interfaces/external/cors-options.interface";

export const LOCAL_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

export function resolveCorsOrigins(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const isProduction =
    environment.NODE_ENV ===
    "production";

  const corsOrigin =
    environment.CORS_ORIGIN?.trim();

  if (
    isProduction &&
    !corsOrigin
  ) {
    throw new Error(
      "CORS_ORIGIN is required in production",
    );
  }

  const allowedOrigins =
    corsOrigin
      ? corsOrigin
          .split(",")
          .map(
            (origin) =>
              origin.trim(),
          )
          .filter(Boolean)
      : [...LOCAL_CORS_ORIGINS];

  if (allowedOrigins.length === 0) {
    throw new Error(
      "CORS_ORIGIN must contain at least one origin",
    );
  }

  for (const origin of allowedOrigins) {
    if (origin === "*") {
      throw new Error(
        "Wildcard CORS origins are not allowed",
      );
    }

    let parsedOrigin: URL;

    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(
        `Invalid CORS origin: ${origin}`,
      );
    }

    if (
      !["http:", "https:"].includes(
        parsedOrigin.protocol,
      ) ||
      parsedOrigin.origin !== origin
    ) {
      throw new Error(
        `Invalid CORS origin: ${origin}`,
      );
    }
  }

  return allowedOrigins;
}

export function createCorsOptions(
  environment: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  const allowedOrigins =
    resolveCorsOrigins(environment);

  const validateOrigin: CustomOrigin = (
    origin,
    callback,
  ) => {
    /*
     * Allow non-browser requests
     * such as curl/Postman/server
     * integrations that have no Origin.
     */
    if (!origin) {
      return callback(
        null,
        true,
      );
    }

    if (
      allowedOrigins.includes(
        origin,
      )
    ) {
      return callback(
        null,
        true,
      );
    }

    return callback(
      new Error(
        "Origin not allowed by CORS",
      ),
      false,
    );
  };

  return {
    origin: validateOrigin,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
    ],
  };
}
