import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import express from "express";
import helmet from "helmet";

test("Helmet adds protective HTTP headers", async () => {
  const app = express();

  app.use(helmet());
  app.get("/headers-probe", (_request, response) => {
    response.json({
      success: true,
    });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/headers-probe`,
    );

    assert.equal(response.status, 200);
    assert.ok(
      response.headers.get(
        "content-security-policy",
      ),
    );
    assert.equal(
      response.headers.get(
        "x-content-type-options",
      ),
      "nosniff",
    );
    assert.equal(
      response.headers.get(
        "x-frame-options",
      ),
      "SAMEORIGIN",
    );
    assert.ok(
      response.headers.get(
        "strict-transport-security",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});
