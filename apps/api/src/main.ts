import path from "node:path";
import dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  configureApiRuntime,
} from "./api-runtime";
import {
  validateEnvironment,
} from "./environment.config";

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(
    AppModule,
    {
      bodyParser: false,
    },
  );

  configureApiRuntime(app);

  const port = Number(
    process.env.PORT ?? 3001,
  );

  await app.listen(port);

  console.log(
    `WELLBLOOM POS API running at http://localhost:${port}`,
  );
}

bootstrap();
