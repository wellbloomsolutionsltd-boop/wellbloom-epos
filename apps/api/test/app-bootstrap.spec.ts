import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import {
  configureApiRuntime,
} from "../src/api-runtime";
import {
  validateEnvironment,
} from "../src/environment.config";

test("AppModule bootstraps with the real provider graph", async () => {
  dotenv.config({
    path: path.resolve(import.meta.dirname, "../../../.env"),
  });

  validateEnvironment();

  const app = await NestFactory.create(
    AppModule,
    {
      logger: false,
      bodyParser: false,
    },
  );

  configureApiRuntime(app);

  try {
    await app.init();
    assert.ok(app.get(AppModule));
  } finally {
    await app.close();
  }
});
