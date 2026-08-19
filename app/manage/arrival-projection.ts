import type { Booking, BookingSession } from "./management-adapter";

export type ReservationArrival = {
  key: string;
  booking: Booking;
  bookingDate: string | null;
  dateLabel: string;
  startClock: string;
  startTime: string;
  startMinutes: number | null;
  courtScope: string;
  sessionSummary: string;
  sessionDetails: string;
};

function clockMinutes(value: string | null): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function displayClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  if (hours > 23) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${match[2]} ${suffix}`;
}

function fallbackStartTime(booking: Booking): { raw: string; display: string } {
  if (booking.startTime?.trim()) {
    const raw = booking.startTime.trim();
    return { raw, display: displayClock(raw) };
  }
  const raw = booking.time.split(/[–-]/)[0]?.trim() || "Time not returned";
  return { raw, display: displayClock(raw) };
}

function exactSessionDetails(sessions: BookingSession[], commonTime: string | null): string {
  if (commonTime) return [...new Set(sessions.map((session) => session.court))].join(" · ");
  return sessions.map((session) => `${session.court} ${session.time}`).join(" · ");
}

export function reservationArrivalGroups(booking: Booking): ReservationArrival[] {
  if (!booking.sessions?.length) {
    const fallback = fallbackStartTime(booking);
    return [{
      key: `${booking.bookingId}:${booking.bookingDate ?? "unknown"}:${fallback.raw}`,
      booking,
      bookingDate: booking.bookingDate,
      dateLabel: booking.date,
      startClock: fallback.raw,
      startTime: fallback.display,
      startMinutes: clockMinutes(fallback.raw),
      courtScope: booking.court,
      sessionSummary: booking.time,
      sessionDetails: `${booking.court} · ${booking.time}`,
    }];
  }

  const grouped = new Map<string, BookingSession[]>();
  for (const session of booking.sessions) {
    const key = `${session.bookingDate}:${session.startTime}`;
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }

  return [...grouped.entries()].map(([groupKey, sessions]) => {
    const ordered = [...sessions].sort((left, right) =>
      left.court.localeCompare(right.court) || left.endsAt.localeCompare(right.endsAt)
    );
    const first = ordered[0];
    const courtNames = [...new Set(ordered.map((session) => session.court))];
    const times = [...new Set(ordered.map((session) => session.time))];
    const commonTime = times.length === 1 ? times[0] : null;
    return {
      key: `${booking.bookingId}:${groupKey}`,
      booking,
      bookingDate: first.bookingDate,
      dateLabel: first.date,
      startClock: first.startTime,
      startTime: displayClock(first.startTime),
      startMinutes: clockMinutes(first.startTime),
      courtScope: courtNames.length === 1 ? courtNames[0] : `${courtNames.length} courts`,
      sessionSummary: commonTime ?? `${ordered.length} exact session times`,
      sessionDetails: exactSessionDetails(ordered, commonTime),
    };
  }).sort((left, right) =>
    (left.bookingDate ?? "9999-12-31").localeCompare(right.bookingDate ?? "9999-12-31") ||
    (left.startMinutes ?? 10_000) - (right.startMinutes ?? 10_000)
  );
}

export function upcomingReservationArrivals(
  bookings: Booking[],
  today: string,
  currentMinutes: number,
  limit = 4,
): ReservationArrival[] {
  return bookings
    .flatMap(reservationArrivalGroups)
    .filter((arrival) => {
      if (!arrival.bookingDate) return true;
      if (arrival.bookingDate > today) return true;
      if (arrival.bookingDate < today) return false;
      return arrival.startMinutes === null || arrival.startMinutes + 60 >= currentMinutes;
    })
    .sort((left, right) =>
      (left.bookingDate ?? "9999-12-31").localeCompare(right.bookingDate ?? "9999-12-31") ||
      (left.startMinutes ?? 10_000) - (right.startMinutes ?? 10_000) ||
      left.booking.reference.localeCompare(right.booking.reference)
    )
    .slice(0, limit);
}
