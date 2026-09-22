import path from "node:path";
import dotenv from "dotenv";
import {
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  createCorsOptions,
} from "./cors.config";

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors(
    createCorsOptions(),
  );

  await app.listen(3001);

  console.log(
    "WELLBLOOM POS API running at http://localhost:3001",
  );
}

bootstrap();
