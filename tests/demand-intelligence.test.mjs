import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app/manage/demand-intelligence.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const demandModule = { exports: {} };
vm.runInNewContext(javascript, { module: demandModule, exports: demandModule.exports, Date, Math });
const { buildDemandSignals, demandLearningStatus, prioritizeDemandSignals } = demandModule.exports;

function booking(date, courtId, startTime, duration, status = "completed") {
  return { bookingId: `${date}-${startTime}`, bookingType: "regular", reference: "PB-TEST", id: "PB-TEST", customer: "Player", initials: "P", phone: "+639000000000", court: courtId, date, time: "", duration: String(duration), amount: 300 * duration, status, payment: "paid", courtId, bookingDate: date, startTime, createdAt: `${date}T00:00:00Z` };
}

test("holds recommendations until 30 completed live-activity days", () => {
  const learning = demandLearningStatus([booking("2026-08-10", "c1", "09:00", 1)], "2026-08-13");
  assert.equal(learning.ready, false);
  assert.equal(learning.completedDays, 3);
  assert.equal(learning.analysisThrough, "2026-08-12");
});

test("unlocks after a full 30 completed days", () => {
  const learning = demandLearningStatus([booking("2026-07-14", "c1", "09:00", 1)], "2026-08-13");
  assert.equal(learning.ready, true);
  assert.equal(learning.completedDays, 30);
});

test("protects naturally full windows from discount recommendations", () => {
  const mondays = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"];
  const signals = buildDemandSignals({
    bookings: mondays.flatMap((date) => [booking(date, "c1", "17:00", 3)]),
    blocks: [], courts: [{ id: "c1", name: "Court 1" }],
    dateFrom: "2026-07-01", dateTo: "2026-07-31", revenuePerHour: 300,
  });
  const peak = signals.find((signal) => signal.weekday === 0 && signal.window.id === "evening");
  assert.equal(peak.state, "protected_peak");
  assert.equal(peak.protectedFromDiscounts, true);
  assert.equal(peak.action, "maintain_price");
  assert.equal(prioritizeDemandSignals(signals).some((signal) => signal.key === peak.key), false);
});

test("finds exact weak windows and removes blocked capacity", () => {
  const mondays = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"];
  const signals = buildDemandSignals({
    bookings: [booking(mondays[0], "c1", "09:00", 1), booking(mondays[1], "c1", "09:00", 1, "cancelled")],
    blocks: [{ id: "b1", courtId: "c1", court: "Court 1", date: "", dateValue: mondays[3], time: "", startTime: "09:00", endTime: "12:00", reason: "Maintenance", publicLabel: "Maintenance", internalReason: null, createdBy: null }],
    courts: [{ id: "c1", name: "Court 1" }],
    dateFrom: "2026-07-01", dateTo: "2026-07-31", revenuePerHour: 300,
  });
  const morning = signals.find((signal) => signal.weekday === 0 && signal.window.id === "morning");
  assert.equal(morning.availableCourtHours, 9);
  assert.equal(morning.bookedCourtHours, 1);
  assert.equal(morning.state, "persistent_vacancy");
  assert.equal(morning.protectedFromDiscounts, false);
  assert.equal(prioritizeDemandSignals(signals, 50).some((signal) => signal.key === morning.key), true);
});

test("abstains when comparable history is insufficient", () => {
  const signals = buildDemandSignals({ bookings: [], blocks: [], courts: [{ id: "c1", name: "Court 1" }], dateFrom: "2026-07-01", dateTo: "2026-07-07", revenuePerHour: 300 });
  assert.ok(signals.every((signal) => signal.state === "insufficient_data"));
  assert.equal(prioritizeDemandSignals(signals).length, 0);
});

test("keeps watch windows observation-only", () => {
  const signals = [{ key: "watch", state: "watch", utilization: 50, observations: 12 }];
  assert.equal(prioritizeDemandSignals(signals).length, 0);
});
