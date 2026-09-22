import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from "@nestjs/common";
import {
  AllExceptionsFilter,
} from "../src/common/filters/all-exceptions.filter";

function createHarness() {
  const request = {
    requestId: "request-123",
    url: "/test-path?query=safe",
  };
  const response = {};
  const replies: Array<{
    body: any;
    status: number;
  }> = [];
  const adapterHost: any = {
    httpAdapter: {
      reply: (
        _response: unknown,
        body: any,
        status: number,
      ) => {
        replies.push({
          body,
          status,
        });
      },
      getRequestUrl: () => request.url,
    },
  };
  const filter = new AllExceptionsFilter(
    adapterHost,
  );
  const logged: Array<{
    message: unknown;
    trace: unknown;
  }> = [];

  (filter as any).logger = {
    error: (message: unknown, trace: unknown) => {
      logged.push({
        message,
        trace,
      });
    },
  };

  const host: any = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };

  return {
    filter,
    host,
    replies,
    logged,
  };
}

test("safe client errors retain their public message and request ID", () => {
  const harness = createHarness();

  harness.filter.catch(
    new BadRequestException({
      message: [
        "email must be an email",
      ],
    }),
    harness.host,
  );

  assert.equal(harness.replies.length, 1);
  assert.equal(harness.replies[0].status, 400);
  assert.deepEqual(
    harness.replies[0].body.message,
    ["email must be an email"],
  );
  assert.equal(
    harness.replies[0].body.requestId,
    "request-123",
  );
  assert.equal(
    harness.replies[0].body.path,
    "/test-path?query=safe",
  );
  assert.equal(harness.logged.length, 0);
});

test("unexpected errors are logged and sanitized", () => {
  const harness = createHarness();
  const internalDetail =
    "database password and Windows path must stay private";

  harness.filter.catch(
    new Error(internalDetail),
    harness.host,
  );

  assert.equal(harness.replies[0].status, 500);
  assert.equal(
    harness.replies[0].body.message,
    "Internal server error",
  );
  assert.equal(
    JSON.stringify(
      harness.replies[0].body,
    ).includes(internalDetail),
    false,
  );
  assert.match(
    String(harness.logged[0].message),
    /request-123/,
  );
  assert.match(
    String(harness.logged[0].trace),
    /database password/,
  );
});

test("5xx HttpException messages are also sanitized", () => {
  const harness = createHarness();

  harness.filter.catch(
    new InternalServerErrorException(
      "provider credential failed",
    ),
    harness.host,
  );

  assert.equal(
    harness.replies[0].body.message,
    "Internal server error",
  );
  assert.equal(
    JSON.stringify(
      harness.replies[0].body,
    ).includes(
      "provider credential",
    ),
    false,
  );
});

test("string client HttpException messages remain visible", () => {
  const harness = createHarness();

  harness.filter.catch(
    new HttpException(
      "Request cannot be processed",
      422,
    ),
    harness.host,
  );

  assert.equal(harness.replies[0].status, 422);
  assert.equal(
    harness.replies[0].body.message,
    "Request cannot be processed",
  );
});
