import assert from "node:assert/strict";
import test from "node:test";
import type {
  AddressInfo,
} from "node:net";
import cors from "cors";
import express from "express";
import {
  createCorsOptions,
} from "../src/cors.config";

async function withCorsApp(
  callback: (baseUrl: string) => Promise<void>,
) {
  const app = express();

  app.use(cors(
    createCorsOptions({
      NODE_ENV: "development",
      CORS_ORIGIN:
        "http://localhost:3000",
    }),
  ));
  app.get("/cors-probe", (_request, response) => {
    response.json({
      success: true,
    });
  });
  app.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.sendStatus(403);
    },
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address() as AddressInfo;

  try {
    await callback(
      `http://127.0.0.1:${address.port}`,
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
}

test("configured browser origin is allowed with credentials", async () => {
  await withCorsApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/cors-probe`,
      {
        headers: {
          Origin: "http://localhost:3000",
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get(
        "access-control-allow-origin",
      ),
      "http://localhost:3000",
    );
    assert.equal(
      response.headers.get(
        "access-control-allow-credentials",
      ),
      "true",
    );
  });
});

test("unknown browser origin is rejected", async () => {
  await withCorsApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/cors-probe`,
      {
        headers: {
          Origin: "https://unknown.example",
        },
      },
    );

    assert.equal(response.status, 403);
    assert.equal(
      response.headers.has(
        "access-control-allow-origin",
      ),
      false,
    );
  });
});

test("request without Origin is allowed", async () => {
  await withCorsApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/cors-probe`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
      await response.json(),
      {
        success: true,
      },
    );
  });
});

test("OPTIONS preflight returns the configured CORS headers", async () => {
  await withCorsApp(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/cors-probe`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method":
            "GET",
          "Access-Control-Request-Headers":
            "Authorization,X-Request-Id",
        },
      },
    );

    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get(
        "access-control-allow-origin",
      ),
      "http://localhost:3000",
    );
    assert.equal(
      response.headers.get(
        "access-control-allow-credentials",
      ),
      "true",
    );
    assert.match(
      response.headers.get(
        "access-control-allow-methods",
      ) ?? "",
      /GET/,
    );
    assert.match(
      response.headers.get(
        "access-control-allow-headers",
      ) ?? "",
      /Authorization/,
    );
  });
});

test("production configuration requires CORS_ORIGIN", () => {
  assert.throws(
    () => createCorsOptions({
      NODE_ENV: "production",
    }),
    /CORS_ORIGIN is required in production/,
  );
});

test("local defaults allow localhost and loopback frontend origins", () => {
  const options = createCorsOptions({
    NODE_ENV: "development",
  });
  const origin = options.origin;

  assert.equal(typeof origin, "function");

  for (const allowed of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]) {
    let accepted = false;

    (origin as Function)(
      allowed,
      (error: Error | null, result: boolean) => {
        assert.equal(error, null);
        accepted = result;
      },
    );

    assert.equal(accepted, true);
  }
});

test("wildcard origins are rejected", () => {
  assert.throws(
    () => createCorsOptions({
      NODE_ENV: "development",
      CORS_ORIGIN: "*",
    }),
    /Wildcard CORS origins are not allowed/,
  );
});
