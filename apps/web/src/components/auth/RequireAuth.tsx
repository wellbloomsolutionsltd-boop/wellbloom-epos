"use client";

import {
  useEffect,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  useAuth,
} from "./AuthProvider";

export function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    loading,
  } = useAuth();

  const router =
    useRouter();

  useEffect(() => {
    if (
      !loading &&
      !user
    ) {
      router.replace(
        "/login",
      );
    }
  }, [
    loading,
    user,
    router,
  ]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "var(--wb-navy)",
          fontWeight: 700,
        }}
      >
        Loading Wellbloom…
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {children}
    </>
  );
}
