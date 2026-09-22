import type {
  CorsOptions,
  CustomOrigin,
} from "@nestjs/common/interfaces/external/cors-options.interface";

export function createCorsOptions(
  environment: NodeJS.ProcessEnv = process.env,
): CorsOptions {
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
      : [
          "http://localhost:3000",
        ];

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
