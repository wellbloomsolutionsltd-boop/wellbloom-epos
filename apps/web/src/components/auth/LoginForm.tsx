"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [tenantCode, setTenantCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      router.replace("/admin/dashboard");
    }
  }, [router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(tenantCode, email, password);
      router.replace("/admin/dashboard");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to sign in",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-form-wrap">
      <div className="login-form-heading">
        <h2>Sign in</h2>
        <p>Access your Wellbloom workspace.</p>
      </div>

      <form className="login-form" onSubmit={handleSubmit}>
        <Input
          label="Business code"
          value={tenantCode}
          onChange={(event) => setTenantCode(event.target.value.toUpperCase())}
          placeholder="WELLBLOOM"
          autoComplete="organization"
          required
          leadingIcon={<span aria-hidden="true">◇</span>}
        />
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          required
          leadingIcon={<span aria-hidden="true">@</span>}
        />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          leadingIcon={<span aria-hidden="true">••</span>}
          trailingAction={
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
        />

        {error && (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#fff3f2",
              color: "var(--wb-danger)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <Button type="submit" size="lg" loading={loading} className="login-submit">
          Sign in
        </Button>
      </form>
    </div>
  );
}
