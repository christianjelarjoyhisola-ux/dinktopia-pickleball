import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("customer directory uses deterministic phone-first canonical identities", async () => {
  const adapter = await readFile(
    new URL("app/manage/management-adapter.ts", root),
    "utf8",
  );
  const start = adapter.indexOf("function deriveLiveCustomers(");
  const end = adapter.indexOf("\nexport const formatPeso", start);
  const implementation = adapter.slice(start, end);

  assert.ok(start >= 0 && end > start, "customer derivation implementation must exist");
  assert.match(implementation, /const orderedRows = \[\.\.\.bookingRows\]\.sort/);
  assert.match(implementation, /const existingMatch = phoneMatch \?\?/);
  assert.match(implementation, /hasValidName && !existing\.hasCanonicalName/);
  assert.match(implementation, /existing\.aliases\.push\(rawName\)/);
  assert.doesNotMatch(implementation, /nameTimestamp >= existing\.latestNameAt/);
  assert.doesNotMatch(implementation, /identityConflict \? undefined : phoneMatch/);
});

test("customer aliases are exposed in the premium directory UI", async () => {
  const [adapter, page] = await Promise.all([
    readFile(new URL("app/manage/management-adapter.ts", root), "utf8"),
    readFile(new URL("app/manage/page.tsx", root), "utf8"),
  ]);

  assert.match(adapter, /aliases\?: string\[\]/);
  assert.match(adapter, /aliases: customer\.aliases/);
  assert.match(page, /Also booked as/);
  assert.match(page, /selectedCustomer\.aliases\.map/);
});
