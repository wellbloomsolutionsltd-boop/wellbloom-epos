"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type PosLockReason = "MANUAL" | "INACTIVITY";

export type PosLockState = {
  locked: boolean;
  reason: PosLockReason | null;
};

type PosLockContextValue = PosLockState & {
  lock: (reason: PosLockReason) => void;
  unlockAfterPinVerification: () => void;
};

export const DEFAULT_POS_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

const activityEvents: readonly (keyof WindowEventMap)[] = [
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
];

const PosLockContext = createContext<PosLockContextValue | undefined>(
  undefined,
);

export function PosLockProvider({
  children,
  inactivityTimeoutMs = DEFAULT_POS_INACTIVITY_TIMEOUT_MS,
}: {
  children: ReactNode;
  inactivityTimeoutMs?: number;
}) {
  const [lockState, setLockState] = useState<PosLockState>({
    locked: false,
    reason: null,
  });
  const lastActivityAt = useRef(Date.now());

  const lock = useCallback((reason: PosLockReason) => {
    setLockState({
      locked: true,
      reason,
    });
  }, []);

  const unlockAfterPinVerification = useCallback(() => {
    lastActivityAt.current = Date.now();
    setLockState({
      locked: false,
      reason: null,
    });
  }, []);

  useEffect(() => {
    if (lockState.locked) {
      return;
    }

    const timeoutMs =
      inactivityTimeoutMs > 0
        ? inactivityTimeoutMs
        : DEFAULT_POS_INACTIVITY_TIMEOUT_MS;
    let timeoutId: number | undefined;

    function scheduleLock() {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      const elapsed = Date.now() - lastActivityAt.current;
      const remaining = Math.max(0, timeoutMs - elapsed);

      timeoutId = window.setTimeout(() => {
        lock("INACTIVITY");
      }, remaining);
    }

    function recordActivity() {
      if (document.visibilityState === "hidden") {
        return;
      }

      lastActivityAt.current = Date.now();
      scheduleLock();
    }

    function checkAfterVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (Date.now() - lastActivityAt.current >= timeoutMs) {
        lock("INACTIVITY");
        return;
      }

      scheduleLock();
    }

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity);
    });
    document.addEventListener("visibilitychange", checkAfterVisibilityChange);
    scheduleLock();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener(
        "visibilitychange",
        checkAfterVisibilityChange,
      );
    };
  }, [inactivityTimeoutMs, lock, lockState.locked]);

  const value = useMemo(
    () => ({
      ...lockState,
      lock,
      unlockAfterPinVerification,
    }),
    [lockState, lock, unlockAfterPinVerification],
  );

  return (
    <PosLockContext.Provider value={value}>
      {children}
    </PosLockContext.Provider>
  );
}

export function usePosLock() {
  const context = useContext(PosLockContext);

  if (!context) {
    throw new Error("usePosLock must be used within PosLockProvider");
  }

  return context;
}
