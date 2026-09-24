import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import {
  Body,
  Controller,
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  IsEmail,
  IsString,
} from "class-validator";
import {
  configureApiRuntime,
} from "../src/api-runtime";
import {
  RequestIdMiddleware,
} from "../src/common/middleware/request-id.middleware";

class RuntimeProbeDto {
  email!: string;

  name!: string;
}

IsEmail()(
  RuntimeProbeDto.prototype,
  "email",
);
IsString()(
  RuntimeProbeDto.prototype,
  "name",
);

@Controller("request-id-probe")
class RequestIdProbeController {
  create(
    dto: RuntimeProbeDto,
  ) {
    return dto;
  }
}

Reflect.defineMetadata(
  "design:paramtypes",
  [RuntimeProbeDto],
  RequestIdProbeController.prototype,
  "create",
);
Body()(
  RequestIdProbeController.prototype,
  "create",
  0,
);
Post()(
  RequestIdProbeController.prototype,
  "create",
  Object.getOwnPropertyDescriptor(
    RequestIdProbeController.prototype,
    "create",
  )!,
);

@Module({
  controllers: [RequestIdProbeController],
})
class RequestIdProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

async function withRequestIdApp(
  callback: (baseUrl: string) => Promise<void>,
) {
  const app = await NestFactory.create(
    RequestIdProbeModule,
    {
      logger: false,
      bodyParser: false,
    },
  );

  configureApiRuntime(app, {
    NODE_ENV: "development",
  });

  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer()
    .address() as AddressInfo;

  try {
    await callback(
      `http://127.0.0.1:${address.port}`,
    );
  } finally {
    await app.close();
  }
}

test("responses include a generated X-Request-Id header", async () => {
  await withRequestIdApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/request-id-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "Wellbloom",
        }),
      },
    );

    assert.match(
      response.headers.get("x-request-id") ?? "",
      /^[0-9a-f-]{36}$/i,
    );
  });
});

test("responses echo back a client-supplied X-Request-Id header", async () => {
  await withRequestIdApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/request-id-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "client-supplied-id",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "Wellbloom",
        }),
      },
    );

    assert.equal(
      response.headers.get("x-request-id"),
      "client-supplied-id",
    );
  });
});
