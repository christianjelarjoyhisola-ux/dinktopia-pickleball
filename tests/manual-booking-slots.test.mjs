import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualBookingSlots,
  nextManualSlotSelection,
} from "../app/manage/manual-booking-slots.ts";

const court = {
  id: "court-1",
  slug: "court-1",
  name: "Court 1",
  description: "",
  surface: "Indoor",
  status: "active",
  sortOrder: 0,
  opensAt: "08:00",
  closesAt: "00:00",
  rateDay: 300,
  ratePeak: 400,
  photoUrl: null,
  photoAlt: null,
  photoCaption: null,
};

test("manual booking slots follow court hours and disable past or unavailable inventory", () => {
  const availability = {
    date: "2026-08-19",
    timezone: "Asia/Manila",
    courts: [{
      id: "court-1",
      name: "Court 1",
      unavailable: [{
        startsAt: "2026-08-19T10:00:00+08:00",
        endsAt: "2026-08-19T12:00:00+08:00",
        label: "Booked",
      }],
    }],
  };
  const slots = buildManualBookingSlots(
    court,
    "2026-08-19",
    availability,
    Date.parse("2026-08-19T09:30:00+08:00"),
  );
  assert.equal(slots.length, 16);
  assert.equal(slots[0].state, "past");
  assert.equal(slots.find((slot) => slot.startTime === "10:00")?.state, "unavailable");
  assert.equal(slots.find((slot) => slot.startTime === "10:00")?.statusLabel, "Booked");
  assert.equal(slots.find((slot) => slot.startTime === "12:00")?.state, "open");
  assert.equal(slots.at(-1)?.startTime, "23:00");
});

test("manual slot selection only creates one contiguous range", () => {
  const slots = buildManualBookingSlots(
    court,
    "2026-08-20",
    { date: "2026-08-20", timezone: "Asia/Manila", courts: [{ id: "court-1", name: "Court 1", unavailable: [] }] },
    Date.parse("2026-08-19T00:00:00+08:00"),
  );
  const noon = slots.find((slot) => slot.startTime === "12:00");
  const one = slots.find((slot) => slot.startTime === "13:00");
  const three = slots.find((slot) => slot.startTime === "15:00");
  assert.ok(noon && one && three);
  const first = nextManualSlotSelection(slots, [], noon.key);
  const extended = nextManualSlotSelection(slots, first, one.key);
  assert.deepEqual(extended, [noon.key, one.key]);
  assert.deepEqual(nextManualSlotSelection(slots, extended, three.key), [three.key]);
  assert.deepEqual(nextManualSlotSelection(slots, extended, noon.key), [one.key]);
});
