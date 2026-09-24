import {
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import express from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import helmet from "helmet";
import {
  createCorsOptions,
} from "./cors.config";

export const REQUEST_BODY_LIMIT = "1mb";

export function configureApiRuntime(
  app: INestApplication,
  environment: NodeJS.ProcessEnv = process.env,
) {
  app.use(helmet());

  app.use(
    express.json({
      limit: REQUEST_BODY_LIMIT,
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: REQUEST_BODY_LIMIT,
    }),
  );

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "entity.too.large"
      ) {
        response.status(413).json({
          statusCode: 413,
          message: "Request body too large",
        });
        return;
      }

      if (
        error instanceof SyntaxError &&
        "status" in error &&
        error.status === 400
      ) {
        response.status(400).json({
          statusCode: 400,
          message: "Malformed JSON request body",
        });
        return;
      }

      next(error);
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors(
    createCorsOptions(environment),
  );
}
