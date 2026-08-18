import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapterPath = new URL("../app/manage/management-adapter.ts", import.meta.url);
const calendarPath = new URL("../app/manage/calendar-view.tsx", import.meta.url);

test("management maps authoritative booking slots into exact court sessions", async () => {
  const adapter = await readFile(adapterPath, "utf8");
  const parserStart = adapter.indexOf("function liveBookingSessions(");
  const parserEnd = adapter.indexOf("function liveStatus(", parserStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart);
  const parser = adapter.slice(parserStart, parserEnd);

  assert.match(parser, /Array\.isArray\(row\.booking_slots\)/);
  assert.match(parser, /slot\.courtId.*slot\.startsAt\.toISOString\(\).*slot\.endsAt\.toISOString\(\)/s);
  assert.match(parser, /previous\.courtId === slot\.courtId[\s\S]*?previous\.endsAt\.getTime\(\) === slot\.startsAt\.getTime\(\)/);
  assert.match(parser, /metadata\?\.atomicMultiSessionBookingV1 === true[\s\S]*?LIVE_BOOKING_SESSIONS_INVALID/);
  assert.match(parser, /bookingDate: localDateValue\(candidate\.startsAt\)/);
  assert.match(parser, /key: `\$\{bookingId\}:\$\{candidate\.courtId\}:\$\{candidate\.startsAt\.toISOString\(\)\}:\$\{candidate\.endsAt\.toISOString\(\)\}`/);
});

test("calendar expands sessions while deduplicating parent totals and reservations", async () => {
  const [adapter, calendar] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(calendarPath, "utf8"),
  ]);

  assert.match(adapter, /listManagerBookings\(session\.access_token, \{ activeOnly: true, limit: 500 \}\)/);
  assert.match(adapter, /booking\.sessions\?\.some\(\(session\) => session\.bookingDate === date\)/);
  assert.match(calendar, /booking\.sessions\.map\(\(session\) => \(\{[\s\S]*?parentBookingId: booking\.bookingId[\s\S]*?courtId: session\.courtId[\s\S]*?bookingDate: session\.bookingDate/);
  assert.match(calendar, /function bookingGroupId\(booking: Booking\)[\s\S]*?booking\.parentBookingId \?\? booking\.bookingId/);
  assert.match(calendar, /const paidRevenue = reservations[\s\S]*?reservation\.totalAmount/);
  assert.match(calendar, /const bookedMinutes = visibleBookings\.reduce[\s\S]*?durationMinutes\(booking\.duration\)/);
  assert.match(calendar, /selectedTimelineReservation\.sessions\.map[\s\S]*?session\.court[\s\S]*?session\.time/);
  assert.match(calendar, /reservations\.length[\s\S]*?visibleBookings\.length[\s\S]*?court/);
});
