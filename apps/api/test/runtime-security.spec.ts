import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import {
  Body,
  Controller,
  Module,
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

@Controller("runtime-probe")
class RuntimeProbeController {
  create(
    dto: RuntimeProbeDto,
  ) {
    return dto;
  }
}

Reflect.defineMetadata(
  "design:paramtypes",
  [RuntimeProbeDto],
  RuntimeProbeController.prototype,
  "create",
);
Body()(
  RuntimeProbeController.prototype,
  "create",
  0,
);
Post()(
  RuntimeProbeController.prototype,
  "create",
  Object.getOwnPropertyDescriptor(
    RuntimeProbeController.prototype,
    "create",
  )!,
);

@Module({
  controllers: [RuntimeProbeController],
})
class RuntimeProbeModule {}

async function withRuntimeApp(
  callback: (baseUrl: string) => Promise<void>,
) {
  const app = await NestFactory.create(
    RuntimeProbeModule,
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

test("runtime validation rejects extra and malformed DTO fields", async () => {
  await withRuntimeApp(async (baseUrl) => {
    const valid = await fetch(
      `${baseUrl}/runtime-probe`,
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

    assert.equal(valid.status, 201);

    const extra = await fetch(
      `${baseUrl}/runtime-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "Wellbloom",
          role: "SUPER_ADMIN",
        }),
      },
    );

    assert.equal(extra.status, 400);

    const malformed = await fetch(
      `${baseUrl}/runtime-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "not-an-email",
          name: 42,
        }),
      },
    );

    assert.equal(malformed.status, 400);
  });
});

test("runtime applies security headers and a one-megabyte body limit", async () => {
  await withRuntimeApp(async (baseUrl) => {
    const headers = await fetch(
      `${baseUrl}/runtime-probe`,
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

    assert.equal(
      headers.headers.get("x-content-type-options"),
      "nosniff",
    );

    const oversized = await fetch(
      `${baseUrl}/runtime-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "x".repeat(1_100_000),
        }),
      },
    );

    assert.equal(oversized.status, 413);
    const oversizedBody = await oversized.text();
    assert.equal(
      oversizedBody.includes("node_modules"),
      false,
    );
    assert.equal(
      oversizedBody.includes("PayloadTooLargeError"),
      false,
    );

    const invalidJson = await fetch(
      `${baseUrl}/runtime-probe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: '{"email":',
      },
    );

    assert.equal(invalidJson.status, 400);
    assert.deepEqual(
      await invalidJson.json(),
      {
        statusCode: 400,
        message: "Malformed JSON request body",
      },
    );
  });
});
