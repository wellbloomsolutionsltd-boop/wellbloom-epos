"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { apiFetch } from "../../lib/api";

type PosLockScreenProps = {
  reason: "MANUAL" | "INACTIVITY";
  onUnlock: () => void;
};

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json();

    return typeof body.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export function PosLockScreen({
  reason,
  onUnlock,
}: PosLockScreenProps) {
  const router = useRouter();
  const { user, logout, markPinConfigured } = useAuth();
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    pinInputRef.current?.focus();
  }, []);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!/^\d{4,8}$/.test(pin)) {
      setError("Enter your 4 to 8 digit PIN.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiFetch("/auth/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        setPin("");
        setError(await readError(response, "Invalid PIN"));
        window.requestAnimationFrame(() => pinInputRef.current?.focus());
        return;
      }

      setPin("");
      onUnlock();
    } catch {
      setPin("");
      setError("Unable to verify the PIN. Please try again.");
      window.requestAnimationFrame(() => pinInputRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePinSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!/^\d{4,8}$/.test(pin)) {
      setError("Choose a PIN containing 4 to 8 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("The PIN entries do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiFetch("/auth/pin", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          pin,
        }),
      });

      if (!response.ok) {
        setError(
          await readError(
            response,
            "Unable to configure quick PIN",
          ),
        );
        return;
      }

      setPin("");
      setConfirmPin("");
      setCurrentPassword("");
      markPinConfigured();
      onUnlock();
    } catch {
      setError("Unable to configure the quick PIN. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Cashier";

  return (
    <div
      className="pos-lock"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-lock-title"
      data-lock-reason={reason}
    >
      <div className="pos-lock__atmosphere" aria-hidden="true" />

      <section className="pos-lock__card">
        <Image
          className="pos-lock__logo"
          src="/branding/wellbloom-logo-light.svg"
          alt="Wellbloom"
          width={190}
          height={60}
          priority
        />

        <div className="pos-lock__icon" aria-hidden="true">
          <span />
        </div>

        <span className="pos-lock__eyebrow">
          {reason === "INACTIVITY" ? "Locked after inactivity" : "Quick lock"}
        </span>
        <h1 id="pos-lock-title">Welcome back, {user?.firstName ?? "Cashier"}</h1>
        <p className="pos-lock__identity">
          <strong>{displayName}</strong>
          <span>{user?.branch?.name ?? "No branch assigned"}</span>
        </p>

        {user?.pinConfigured ? (
          <form className="pos-lock__form" onSubmit={handleUnlock}>
            <Input
              ref={pinInputRef}
              label="Cashier PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
              error={error || undefined}
              placeholder="Enter PIN"
              aria-label="Cashier PIN"
            />
            <Button type="submit" size="lg" loading={submitting}>
              Unlock POS
            </Button>
          </form>
        ) : (
          <form className="pos-lock__form" onSubmit={handlePinSetup}>
            <p className="pos-lock__setup-note">
              Create a quick PIN once. Your account password confirms this secure setup.
            </p>
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Input
              ref={pinInputRef}
              label="New 4 to 8 digit PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="new-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <Input
              label="Confirm PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
              error={error || undefined}
            />
            <Button type="submit" size="lg" loading={submitting}>
              Save PIN and unlock
            </Button>
          </form>
        )}

        <button
          className="pos-lock__logout"
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut || submitting}
        >
          {loggingOut ? "Signing out…" : "Log out instead"}
        </button>

        <p className="pos-lock__shift-note">
          Locking never closes your shift or clears the current sale.
        </p>
      </section>
    </div>
  );
}
