const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

let accessToken: string | null = null;

let refreshPromise:
  | Promise<RefreshSession | null>
  | null = null;

const sessionInvalidatedListeners = new Set<() => void>();

export type RefreshSession = {
  accessToken: string;
  user: unknown | null;
};

export function setAccessToken(
  token: string | null,
) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onSessionInvalidated(listener: () => void) {
  sessionInvalidatedListeners.add(listener);

  return () => {
    sessionInvalidatedListeners.delete(listener);
  };
}

function notifySessionInvalidated() {
  sessionInvalidatedListeners.forEach((listener) => listener());
}

export async function refreshSession() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await fetch(
      `${API_URL}/auth/refresh`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );

    if (!response.ok) {
      setAccessToken(null);
      return null;
    }

    const data = await response.json();

    const token =
      typeof data.accessToken === "string"
        ? data.accessToken
        : null;

    setAccessToken(token);

    return token
      ? {
          accessToken: token,
          user: data.user ?? null,
        }
      : null;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
) {
  const headers =
    new Headers(
      init.headers ?? {},
    );

  if (accessToken) {
    headers.set(
      "Authorization",
      `Bearer ${accessToken}`,
    );
  }

  if (
    !headers.has(
      "Content-Type",
    ) &&
    init.body
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,
      headers,
      credentials: "include",
    },
  );

  if (
    response.status === 401 &&
    retry
  ) {
    const refreshed =
      await refreshSession();

    if (!refreshed) {
      notifySessionInvalidated();
      return response;
    }

    return apiFetch(
      path,
      init,
      false,
    );
  }

  return response;
}
