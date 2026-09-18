"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  getSession,
  saveSession,
} from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [tenantCode, setTenantCode] =
    useState("WELLBLOOM");

  const [email, setEmail] =
    useState(
      "admin@wellbloom.local",
    );

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    const session = getSession();

    if (session) {
      router.replace("/pos");
    }
  }, [router]);

  async function handleLogin(
    event: FormEvent,
  ) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response =
        await fetch(
          "http://localhost:3001/auth/login",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              tenantCode,
              email,
              password,
            }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message ??
                "Login failed",
        );
      }

      saveSession({
        accessToken:
          data.accessToken,

        user:
          data.user,
      });

      router.replace("/pos");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to login",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-7 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            WELLBLOOM EPOS
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Sign in to start your
            cashier session.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-5"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Company Code
            </label>

            <input
              value={tenantCode}
              onChange={(event) =>
                setTenantCode(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="WELLBLOOM"
              autoComplete="organization"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="cashier@example.com"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {message && (
            <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {loading
              ? "Signing in..."
              : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
