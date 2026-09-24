import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";

test("AppModule bootstraps with the real provider graph", async () => {
  dotenv.config({
    path: path.resolve(import.meta.dirname, "../../../.env"),
  });

  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  try {
    await app.init();
    assert.ok(app.get(AppModule));
  } finally {
    await app.close();
  }
});
