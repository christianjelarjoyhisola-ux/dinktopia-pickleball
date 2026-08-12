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
  assert.match(booking, /restoreTarget\?\.isConnected/);
  assert.match(booking, /floatingOfferRef\.current\?\.focus\(\)/);
});

test("uses a premium mobile sheet with reduced-motion support", () => {
  assert.match(css, /\.offer-center-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.offer-center-dialog\s*\{[^}]*border-radius:\s*22px 22px 0 0/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.offer-center-dialog[\s\S]*?\{\s*animation:\s*none/s);
});

test("compacts mobile offers so players can compare without excessive scrolling", () => {
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.offer-center-dialog\s*\{[^}]*max-height:\s*min\(94dvh,\s*760px\)/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.offer-center-card\s*\{[^}]*padding:\s*9px 10px 10px/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.offer-center-card dl\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.35fr\) minmax\(0,\s*1fr\) auto/s);
});

test("keeps a visible premium offer entry point while players scroll", () => {
  assert.match(booking, /className=\{`floating-offer-pill/);
  assert.match(booking, /Special offer/);
  assert.match(css, /\.floating-offer-pill\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*70/s);
  assert.match(css, /\.booking-route:has\(\.slot-step-footer \.button:not\(:disabled\)\) \.floating-offer-pill\s*\{[^}]*bottom:\s*calc\(92px \+ env\(safe-area-inset-bottom\)\)/s);
});
