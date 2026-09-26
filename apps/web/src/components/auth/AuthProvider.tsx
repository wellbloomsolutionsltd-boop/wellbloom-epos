"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  apiFetch,
  onSessionInvalidated,
  refreshSession,
} from "../../lib/api";
import {
  clearSession,
  saveSession,
} from "../../lib/auth";

export type UserRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "MANAGER"
  | "PHARMACIST"
  | "CASHIER"
  | "INVENTORY_MANAGER"
  | "PROCUREMENT_OFFICER"
  | "ACCOUNTANT"
  | "ECOMMERCE_MANAGER"
  | "REPORT_VIEWER";

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
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
  pinConfigured: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (
    tenantCode: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  markPinConfigured: () => void;
};

const AuthContext =
  createContext<
    AuthContextValue | undefined
  >(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [
    user,
    setUser,
  ] =
    useState<AuthUser | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function restoreSession() {
    try {
      const session =
        await refreshSession();

      if (!session?.user) {
        setUser(null);
        clearSession();
        return;
      }

      const restoredUser =
        session.user as AuthUser;

      setUser(restoredUser);
      saveSession({
        accessToken:
          session.accessToken,
        user: restoredUser,
      });
    } catch {
      setUser(null);
      clearSession();
    } finally {
      setLoading(false);
    }
  }

  async function login(
    tenantCode: string,
    email: string,
    password: string,
  ) {
    const response =
      await apiFetch(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            tenantCode,
            email,
            password,
          }),
        },
        false,
      );

    if (!response.ok) {
      const body =
        await response.json();

      throw new Error(
        body.message ??
          "Login failed",
      );
    }

    const data =
      await response.json();

    const authenticatedUser =
      data.user as AuthUser;

    setUser(authenticatedUser);
    saveSession({
      accessToken: data.accessToken,
      user: authenticatedUser,
    });
  }

  async function logout() {
    try {
      await apiFetch(
        "/auth/logout",
        {
          method: "POST",
        },
        false,
      );
    } finally {
      clearSession();
      setUser(null);
    }
  }

  function markPinConfigured() {
    setUser((currentUser) =>
      currentUser
        ? {
            ...currentUser,
            pinConfigured: true,
          }
        : currentUser,
    );
  }

  useEffect(() => {
    return onSessionInvalidated(() => {
      clearSession();
      setUser(null);
      router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    void restoreSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        restoreSession,
        markPinConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(
      AuthContext,
    );

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider",
    );
  }

  return context;
}
