import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const booking = await readFile(new URL("../app/booking-experience.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/dinktopia.css", import.meta.url), "utf8");

test("uses tenant promotions for a one-time session announcement", () => {
  assert.match(booking, /bootstrap\?\.promotions \?\? \[\]/);
  assert.match(booking, /dinktopia:offer-center:\$\{activeTenant\.slug\}:\$\{offerSignature\}/);
  assert.match(booking, /livePromotions\.length === 0/);
  assert.match(booking, /sessionStorage\.setItem\(storageKey, "seen"\)/);
});

test("keeps the offer center accessible and reopenable", () => {
  assert.match(booking, /className="offer-center-trigger/);
  assert.match(booking, /role="dialog"/);
  assert.match(booking, /aria-modal="true"/);
  assert.match(booking, /event\.key === "Escape"/);
  assert.match(booking, /offerRestoreFocusRef\.current\?\.focus\(\)/);
});

test("uses a premium mobile sheet with reduced-motion support", () => {
  assert.match(css, /\.offer-center-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /@media \(max-width:\s*779\.98px\)[\s\S]*?\.offer-center-dialog\s*\{[^}]*border-radius:\s*24px 24px 0 0/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.offer-center-dialog\s*\{\s*animation:\s*none/s);
});
