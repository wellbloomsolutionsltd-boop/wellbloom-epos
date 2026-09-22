import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestIdMiddleware,
} from "../src/common/middleware/request-id.middleware";
import type {
  RequestWithId,
} from "../src/common/middleware/request-id.middleware";

function createHarness(
  incoming?: string,
) {
  const request = {
    header: (name: string) =>
      name === "x-request-id"
        ? incoming
        : undefined,
  } as RequestWithId;
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => {
      headers.set(name, value);
    },
  } as any;
  let nextCalled = false;

  new RequestIdMiddleware().use(
    request,
    response,
    () => {
      nextCalled = true;
    },
  );

  return {
    request,
    headers,
    nextCalled,
  };
}

test("request ID middleware preserves a trimmed incoming ID", () => {
  const result = createHarness(
    "  frontend-request-123  ",
  );

  assert.equal(
    result.request.requestId,
    "frontend-request-123",
  );
  assert.equal(
    result.headers.get("x-request-id"),
    "frontend-request-123",
  );
  assert.equal(result.nextCalled, true);
});

test("request ID middleware generates an ID when none is supplied", () => {
  const result = createHarness();
  const generated = result.request.requestId;

  assert.match(
    generated ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(
    result.headers.get("x-request-id"),
    generated,
  );
  assert.equal(result.nextCalled, true);
});

test("request ID middleware replaces a blank incoming ID", () => {
  const result = createHarness("   ");

  assert.match(
    result.request.requestId ?? "",
    /^[0-9a-f-]{36}$/i,
  );
  assert.equal(result.nextCalled, true);
});
