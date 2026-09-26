import assert from "node:assert/strict";
import test from "node:test";
import {
  apiFetch,
  getAccessToken,
  onSessionInvalidated,
  refreshSession,
  setAccessToken,
} from "../../web/src/lib/api";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setAccessToken(null);
});

test("page reload restoration uses the refresh cookie and restores memory state", async () => {
  const restoredUser = {
    id: "user-1",
    email: "manager@example.test",
  };
  let calls = 0;

  globalThis.fetch = async (
    input,
    init,
  ) => {
    calls += 1;
    assert.equal(
      String(input),
      "http://localhost:3001/auth/refresh",
    );
    assert.equal(init?.method, "POST");
    assert.equal(
      init?.credentials,
      "include",
    );

    return new Response(
      JSON.stringify({
        accessToken: "restored-access",
        user: restoredUser,
      }),
      {
        status: 201,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );
  };

  const session = await refreshSession();

  assert.equal(calls, 1);
  assert.equal(
    session?.accessToken,
    "restored-access",
  );
  assert.deepEqual(
    session?.user,
    restoredUser,
  );
  assert.equal(
    getAccessToken(),
    "restored-access",
  );
});

test("invalid or expired refresh cookie restores logged-out state", async () => {
  setAccessToken("expired-access");
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message:
          "Invalid or expired refresh token",
      }),
      {
        status: 401,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );

  const session = await refreshSession();

  assert.equal(session, null);
  assert.equal(getAccessToken(), null);
});

test("a protected request refreshes once and retries once with the new access token", async () => {
  setAccessToken("expired-access");
  const calls: Array<{
    url: string;
    authorization: string | null;
    credentials: RequestCredentials | undefined;
  }> = [];

  globalThis.fetch = async (
    input,
    init,
  ) => {
    const headers = new Headers(
      init?.headers,
    );
    calls.push({
      url: String(input),
      authorization:
        headers.get("Authorization"),
      credentials: init?.credentials,
    });

    if (
      String(input).endsWith(
        "/auth/refresh",
      )
    ) {
      return new Response(
        JSON.stringify({
          accessToken: "new-access",
          user: {
            id: "user-1",
          },
        }),
        {
          status: 201,
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    const authorization =
      headers.get("Authorization");

    return new Response(null, {
      status:
        authorization ===
        "Bearer new-access"
          ? 200
          : 401,
    });
  };

  const response = await apiFetch(
    "/protected",
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://localhost:3001/protected",
      "http://localhost:3001/auth/refresh",
      "http://localhost:3001/protected",
    ],
  );
  assert.equal(
    calls[2].authorization,
    "Bearer new-access",
  );
  assert.equal(
    calls.every(
      (call) =>
        call.credentials === "include",
    ),
    true,
  );
});

test("a rejected refresh invalidates the authenticated frontend session", async () => {
  setAccessToken("expired-access");
  let invalidations = 0;
  const unsubscribe = onSessionInvalidated(() => {
    invalidations += 1;
  });
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  };

  try {
    const response = await apiFetch("/protected");

    assert.equal(response.status, 401);
    assert.equal(getAccessToken(), null);
    assert.equal(invalidations, 1);
    assert.equal(calls, 2);
  } finally {
    unsubscribe();
  }
});
