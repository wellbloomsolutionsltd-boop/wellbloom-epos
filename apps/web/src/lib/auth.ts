/**
 * DEVELOPMENT-ONLY AUTH STORAGE
 *
 * This localStorage adapter exists only for the current local MVP. Browser
 * JavaScript can read localStorage, so this must not be treated as the
 * production session architecture and refresh tokens must never be added
 * here.
 *
 * TODO(security/gui-auth): replace this adapter during the GUI/auth pass with
 * a server-managed session using Secure, HttpOnly, SameSite cookies over
 * HTTPS. Update frontend requests to use the cookie-based session while the
 * API continues validating authentication and authorization server-side.
 */

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

/** @deprecated Development-only localStorage session adapter. */
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

/** @deprecated Development-only localStorage session adapter. */
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

/** @deprecated Development-only localStorage session adapter. */
export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(
    SESSION_KEY,
  );
}
