import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const booking = await readFile(
  new URL("../app/booking-experience.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/dinktopia.css", import.meta.url),
  "utf8",
);

test("shows the database-derived price on every available court-hour", () => {
  assert.match(
    booking,
    /!busy && slot && <em className=\{`slot-price/,
  );
  assert.match(booking, /<b>\{peso\(slot\.price\)\}<\/b>/);
});

test("shows regular and discounted prices for offer court-hours", () => {
  assert.match(
    booking,
    /slot\.promotionName && <s>\{peso\(slot\.originalPrice \?\? slot\.price\)\}<\/s>/,
  );
  assert.match(booking, /regular price \$\{peso\(slot\.originalPrice \?\? slot\.price\)\}, offer price/);
});

test("keeps slot pricing compact and aligned at narrow widths", () => {
  assert.match(
    css,
    /\.booking-route \.slot-price\s*\{[^}]*display:\s*grid[^}]*font-variant-numeric:\s*tabular-nums[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    css,
    /\.booking-route \.availability-cell\s*\{[^}]*min-height:\s*60px/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*640px\)[\s\S]*?\.booking-route \.slot-price b\s*\{[^}]*font-size:\s*\.56rem/s,
  );
});
