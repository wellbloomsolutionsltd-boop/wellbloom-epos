import { setAccessToken } from "./api";

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

let currentSession: AuthSession | null = null;

export function saveSession(
  session: AuthSession,
) {
  currentSession = session;
  setAccessToken(session.accessToken);
}

export function getSession():
  | AuthSession
  | null {
  return currentSession;
}

export function clearSession() {
  currentSession = null;
  setAccessToken(null);
}
