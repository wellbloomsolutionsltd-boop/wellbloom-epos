import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const posPagePath = new URL(
  "../../web/src/app/pos/page.tsx",
  import.meta.url,
);
test("completed sales preserve the cashier session and open shift", async () => {
  const source = await readFile(posPagePath, "utf8");
  const newSale = source.match(
    /function startNewSale\(\) \{([\s\S]*?)\n  \}/,
  )?.[1];

  assert.ok(newSale, "startNewSale must remain an explicit state boundary");
  assert.match(newSale, /setCompletedSale\(null\)/);
  assert.match(newSale, /setCart\(\[\]\)/);
  assert.match(newSale, /setSelectedCustomer\(null\)/);
  assert.match(newSale, /setShowPayment\(false\)/);
  assert.doesNotMatch(newSale, /logout|clearSession|setSession|setCurrentShift/);

  assert.doesNotMatch(
    source,
    /\blogout\s*\(/,
    "sale completion must never log out the cashier",
  );
  assert.equal(
    source.match(/setCurrentShift\(/g)?.length,
    1,
    "the open shift may only be populated by the shift lookup",
  );
});
