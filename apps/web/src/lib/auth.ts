export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;

  tenant: {
    id: string;
    name: string;
    code: string;
  };

  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

const SESSION_KEY = "wellbloom_pos_session";

export function saveSession(
  session: AuthSession,
) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session),
  );
}

export function getSession():
  | AuthSession
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value =
    localStorage.getItem(SESSION_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    localStorage.removeItem(
      SESSION_KEY,
    );

    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(
    SESSION_KEY,
  );
}
