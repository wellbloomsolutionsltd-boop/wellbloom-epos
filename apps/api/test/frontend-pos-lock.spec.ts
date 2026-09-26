import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const providerPath = new URL(
  "../../web/src/components/pos/PosLockProvider.tsx",
  import.meta.url,
);
const screenPath = new URL(
  "../../web/src/components/pos/PosLockScreen.tsx",
  import.meta.url,
);
const posPagePath = new URL(
  "../../web/src/app/pos/page.tsx",
  import.meta.url,
);

test("manual and inactivity locking block interaction without unmounting POS state", async () => {
  const source = await readFile(providerPath, "utf8");

  assert.match(source, /DEFAULT_POS_INACTIVITY_TIMEOUT_MS = 5 \* 60 \* 1000/);
  assert.match(source, /lock\("MANUAL"\)/);
  assert.match(source, /lock\("INACTIVITY"\)/);
  for (const eventName of ["pointerdown", "keydown", "touchstart", "wheel"]) {
    assert.match(source, new RegExp(`"${eventName}"`));
  }
  assert.match(source, /lastActivityAt\.current = Date\.now\(\)/);
  assert.match(source, /scheduleLock\(\)/);
  assert.match(source, /setAttribute\("inert", ""\)/);
  assert.match(source, /pos-content--locked/);
  assert.match(source, /\{children\}/);
  assert.doesNotMatch(source, /clearSession|setCart|setCurrentShift|logout\(/);
});

test("successful PIN verification unlocks and resets inactivity tracking", async () => {
  const provider = await readFile(providerPath, "utf8");
  const screen = await readFile(screenPath, "utf8");

  assert.match(screen, /apiFetch\("\/auth\/verify-pin"/);
  assert.match(screen, /if \(!response\.ok\)[\s\S]*setError/);
  assert.match(screen, /onUnlock\(\)/);
  assert.match(
    provider,
    /unlockAfterPinVerification[\s\S]*lastActivityAt\.current = Date\.now\(\)/,
  );
});

test("lock screen logout uses normal revocation path and PIN is never persisted", async () => {
  const screen = await readFile(screenPath, "utf8");

  assert.match(screen, /await logout\(\)/);
  assert.match(screen, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(screen, /localStorage|sessionStorage|indexedDB|IndexedDB/);
  assert.doesNotMatch(screen, /closeShift|setCurrentShift|clearCart|setCart/);
});

test("cart, customer, payment, shift and cashier state survive lock and unlock", async () => {
  const provider = await readFile(providerPath, "utf8");
  const posPage = await readFile(posPagePath, "utf8");

  for (const state of [
    "setCart",
    "setSelectedCustomer",
    "setShowPayment",
    "setCurrentShift",
    "setSession",
  ]) {
    assert.doesNotMatch(provider, new RegExp(state));
    assert.match(posPage, new RegExp(state));
  }
});
