import assert from "node:assert/strict";
import test from "node:test";
import { formatClock12, formatClockRange12 } from "../app/lib/display-time.ts";

test("formats public promotion clocks in familiar 12-hour time", () => {
  assert.equal(formatClock12("00:00"), "12 AM");
  assert.equal(formatClock12("09:30"), "9:30 AM");
  assert.equal(formatClock12("12:00"), "12 PM");
  assert.equal(formatClock12("15:00"), "3 PM");
  assert.equal(formatClockRange12("12:00", "15:00"), "12 PM–3 PM");
  assert.equal(formatClockRange12("06:00", "09:00"), "6 AM–9 AM");
});
