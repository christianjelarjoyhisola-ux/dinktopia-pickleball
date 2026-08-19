import type { AvailabilityResponse } from "../lib/platform/types";
import type { Court } from "./management-adapter";

export type ManualBookingSlotState = "open" | "unavailable" | "past";

export type ManualBookingSlot = {
  key: string;
  bookingDate: string;
  logicalHour: number;
  startTime: string;
  endTime: string;
  startsAt: number;
  endsAt: number;
  state: ManualBookingSlotState;
  statusLabel: string;
};

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clock(hour: number): string {
  return `${String((hour % 24 + 24) % 24).padStart(2, "0")}:00`;
}

function instant(date: string, logicalHour: number): number {
  const actualDate = shiftIsoDate(date, Math.floor(logicalHour / 24));
  return Date.parse(`${actualDate}T${clock(logicalHour)}:00+08:00`);
}

function courtHours(court: Court): { opens: number; closes: number } | null {
  const openMatch = /^(\d{2}):(\d{2})$/.exec(court.opensAt ?? "");
  const closeMatch = /^(\d{2}):(\d{2})$/.exec(court.closesAt ?? "");
  if (!openMatch || !closeMatch || openMatch[2] !== "00" || closeMatch[2] !== "00") return null;
  const opens = Number(openMatch[1]);
  let closes = Number(closeMatch[1]);
  if (closes <= opens) closes += 24;
  return closes > opens && closes - opens <= 24 ? { opens, closes } : null;
}

export function buildManualBookingSlots(
  court: Court | null,
  selectedDate: string,
  availability: AvailabilityResponse | null,
  now = Date.now(),
): ManualBookingSlot[] {
  if (!court || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return [];
  const hours = courtHours(court);
  if (!hours || court.status !== "active") return [];
  const availabilityCourt = availability?.date === selectedDate
    ? availability.courts.find((candidate) => candidate.id === court.id)
    : null;

  return Array.from({ length: hours.closes - hours.opens }, (_, index) => {
    const logicalHour = hours.opens + index;
    const startsAt = instant(selectedDate, logicalHour);
    const endsAt = instant(selectedDate, logicalHour + 1);
    const unavailable = availabilityCourt?.unavailable.find((interval) => {
      const blockedStart = Date.parse(interval.startsAt);
      const blockedEnd = Date.parse(interval.endsAt);
      return Number.isFinite(blockedStart) && Number.isFinite(blockedEnd) && blockedStart < endsAt && blockedEnd > startsAt;
    });
    const isPast = endsAt <= now;
    const actualDate = shiftIsoDate(selectedDate, Math.floor(logicalHour / 24));
    return {
      key: `${actualDate}:${clock(logicalHour)}`,
      bookingDate: actualDate,
      logicalHour,
      startTime: clock(logicalHour),
      endTime: clock(logicalHour + 1),
      startsAt,
      endsAt,
      state: isPast ? "past" : unavailable ? "unavailable" : "open",
      statusLabel: isPast ? "Done" : unavailable?.label?.trim() || (unavailable ? "Unavailable" : "Open"),
    } satisfies ManualBookingSlot;
  });
}

export function nextManualSlotSelection(
  slots: readonly ManualBookingSlot[],
  selectedKeys: readonly string[],
  clickedKey: string,
): string[] {
  const clickedIndex = slots.findIndex((slot) => slot.key === clickedKey && slot.state === "open");
  if (clickedIndex < 0) return [...selectedKeys];
  const selectedIndexes = selectedKeys
    .map((key) => slots.findIndex((slot) => slot.key === key && slot.state === "open"))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  if (!selectedIndexes.length) return [clickedKey];

  const first = selectedIndexes[0];
  const last = selectedIndexes[selectedIndexes.length - 1];
  if (clickedIndex === first && selectedIndexes.length === 1) return [];
  if (clickedIndex === first) return selectedIndexes.slice(1).map((index) => slots[index].key);
  if (clickedIndex === last) return selectedIndexes.slice(0, -1).map((index) => slots[index].key);
  if (clickedIndex === first - 1) return [clickedKey, ...selectedIndexes.map((index) => slots[index].key)];
  if (clickedIndex === last + 1) return [...selectedIndexes.map((index) => slots[index].key), clickedKey];
  return [clickedKey];
}
