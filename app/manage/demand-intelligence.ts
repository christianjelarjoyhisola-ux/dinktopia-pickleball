import type { Booking, CourtBlock } from "./management-adapter";

export type DemandState =
  | "protected_peak"
  | "healthy"
  | "watch"
  | "underused"
  | "persistent_vacancy"
  | "insufficient_data";

export type DemandWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  startHour: number;
  endHour: number;
};

export type DemandSignal = {
  key: string;
  courtId: string;
  courtName: string;
  weekday: number;
  window: DemandWindow;
  state: DemandState;
  observations: number;
  availableCourtHours: number;
  bookedCourtHours: number;
  utilization: number;
  expectedOccupancyLow: number;
  expectedOccupancyHigh: number;
  expectedVacantHoursPerDay: number;
  inventoryValueLow: number;
  inventoryValueHigh: number;
  confidence: "insufficient" | "low" | "medium" | "high";
  protectedFromDiscounts: boolean;
  action: "observe" | "maintain_price" | "increase_visibility" | "targeted_outreach" | "organize_demand";
  actionLabel: string;
  hypothesis: string;
};

export const DEMAND_WINDOWS: DemandWindow[] = [
  { id: "early", startsAt: "06:00", endsAt: "09:00", startHour: 6, endHour: 9 },
  { id: "morning", startsAt: "09:00", endsAt: "12:00", startHour: 9, endHour: 12 },
  { id: "lunch", startsAt: "12:00", endsAt: "15:00", startHour: 12, endHour: 15 },
  { id: "afternoon", startsAt: "15:00", endsAt: "17:00", startHour: 15, endHour: 17 },
  { id: "evening", startsAt: "17:00", endsAt: "20:00", startHour: 17, endHour: 20 },
  { id: "late", startsAt: "20:00", endsAt: "22:00", startHour: 20, endHour: 22 },
];

type DemandInput = {
  bookings: Booking[];
  blocks: CourtBlock[];
  courts: Array<{ id: string; name: string }>;
  dateFrom: string;
  dateTo: string;
  revenuePerHour: number;
};

function dateValues(from: string, to: string) {
  const values: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end && values.length < 400) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function weekdayIndex(date: string) {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function clockHour(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour + minute / 60 : null;
}

function durationHours(booking: Booking) {
  const parsed = Number.parseFloat(booking.duration);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function overlap(start: number, end: number, window: DemandWindow) {
  return Math.max(0, Math.min(end, window.endHour) - Math.max(start, window.startHour));
}

function bookingSegments(booking: Booking) {
  if (booking.sessions?.length) {
    return booking.sessions.map((session) => ({
      courtId: session.courtId,
      date: session.bookingDate,
      start: clockHour(session.startTime),
      end: clockHour(session.endTime),
    }));
  }
  const start = clockHour(booking.startTime);
  const explicitEnd = clockHour(booking.endTime);
  return [{
    courtId: booking.courtId,
    date: booking.bookingDate,
    start,
    end: explicitEnd ?? (start === null ? null : start + durationHours(booking)),
  }];
}

function wilson(success: number, total: number) {
  if (total <= 0) return { low: 0, high: 1 };
  const p = Math.min(1, Math.max(0, success / total));
  const z = 1.645; // A conservative, readable 90% interval for operational decisions.
  const denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return { low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) };
}

function classify(utilization: number, observations: number): DemandState {
  if (observations < 4) return "insufficient_data";
  if (utilization >= 80) return "protected_peak";
  if (utilization >= 60) return "healthy";
  if (utilization >= 40) return "watch";
  if (utilization >= 15) return "underused";
  return "persistent_vacancy";
}

function confidence(observations: number): DemandSignal["confidence"] {
  if (observations < 4) return "insufficient";
  if (observations < 8) return "low";
  if (observations < 16) return "medium";
  return "high";
}

function response(state: DemandState): Pick<DemandSignal, "action" | "actionLabel" | "hypothesis"> {
  if (state === "protected_peak") return { action: "maintain_price", actionLabel: "Protect regular pricing", hypothesis: "Demand repeatedly fills this inventory without intervention." };
  if (state === "healthy") return { action: "maintain_price", actionLabel: "Maintain regular pricing", hypothesis: "Natural demand is healthy; a discount risks unnecessary leakage." };
  if (state === "watch") return { action: "increase_visibility", actionLabel: "Increase visibility first", hypothesis: "Demand is moderate; test awareness before changing price." };
  if (state === "underused") return { action: "targeted_outreach", actionLabel: "Invite relevant players", hypothesis: "Demand is consistently below capacity; relevant outreach may create incremental play." };
  if (state === "persistent_vacancy") return { action: "organize_demand", actionLabel: "Test organized play", hypothesis: "Price may not be the only barrier; open play or a scheduled program can create demand." };
  return { action: "observe", actionLabel: "Collect more evidence", hypothesis: "There are not enough comparable dates for a responsible action." };
}

export function buildDemandSignals(input: DemandInput): DemandSignal[] {
  const dates = dateValues(input.dateFrom, input.dateTo);
  const usableBookings = input.bookings.filter((booking) => !["cancelled", "expired"].includes(booking.status));
  const segments = usableBookings.flatMap(bookingSegments).filter((segment) => segment.date && segment.start !== null && segment.end !== null);

  return input.courts.flatMap((court) => Array.from({ length: 7 }, (_, weekday) =>
    DEMAND_WINDOWS.map((window) => {
      const comparableDates = dates.filter((date) => weekdayIndex(date) === weekday);
      const nominalHours = comparableDates.length * (window.endHour - window.startHour);
      const blockedHours = comparableDates.reduce((sum, date) => sum + input.blocks
        .filter((block) => block.dateValue === date && (block.courtId === null || block.courtId === court.id))
        .reduce((blockSum, block) => {
          const start = clockHour(block.startTime);
          const end = clockHour(block.endTime);
          return blockSum + (start === null || end === null ? 0 : overlap(start, end, window));
        }, 0), 0);
      const availableCourtHours = Math.max(0, nominalHours - Math.min(blockedHours, nominalHours));
      const bookedCourtHours = Math.min(availableCourtHours, segments
        .filter((segment) => segment.courtId === court.id && comparableDates.includes(segment.date!))
        .reduce((sum, segment) => sum + overlap(segment.start!, segment.end!, window), 0));
      const utilization = availableCourtHours > 0 ? Math.round(bookedCourtHours / availableCourtHours * 100) : 0;
      const state = availableCourtHours > 0 ? classify(utilization, comparableDates.length) : "insufficient_data";
      const interval = wilson(bookedCourtHours, availableCourtHours);
      const hoursPerOccurrence = comparableDates.length > 0 ? availableCourtHours / comparableDates.length : 0;
      const expectedVacantHoursPerDay = Math.max(0, hoursPerOccurrence * (1 - bookedCourtHours / Math.max(availableCourtHours, 1)));
      const fourWeekHours = hoursPerOccurrence * 4;
      const recommendation = response(state);
      return {
        key: `${court.id}:${weekday}:${window.id}`,
        courtId: court.id,
        courtName: court.name,
        weekday,
        window,
        state,
        observations: comparableDates.length,
        availableCourtHours: Math.round(availableCourtHours * 10) / 10,
        bookedCourtHours: Math.round(bookedCourtHours * 10) / 10,
        utilization,
        expectedOccupancyLow: Math.round(interval.low * 100),
        expectedOccupancyHigh: Math.round(interval.high * 100),
        expectedVacantHoursPerDay: Math.round(expectedVacantHoursPerDay * 10) / 10,
        inventoryValueLow: Math.round(fourWeekHours * (1 - interval.high) * input.revenuePerHour),
        inventoryValueHigh: Math.round(fourWeekHours * (1 - interval.low) * input.revenuePerHour),
        confidence: confidence(comparableDates.length),
        protectedFromDiscounts: state === "protected_peak" || state === "healthy",
        ...recommendation,
      } satisfies DemandSignal;
    })
  )).flat();
}

export function prioritizeDemandSignals(signals: DemandSignal[], limit = 5) {
  const stateRank: Record<DemandState, number> = {
    persistent_vacancy: 0,
    underused: 1,
    watch: 2,
    protected_peak: 3,
    healthy: 4,
    insufficient_data: 5,
  };
  return signals
    // A "watch" signal is deliberately observation-only. Price action is
    // reserved for inventory with sustained utilization below 40%.
    .filter((signal) => ["persistent_vacancy", "underused"].includes(signal.state))
    .sort((left, right) => stateRank[left.state] - stateRank[right.state] || left.utilization - right.utilization || right.observations - left.observations)
    .slice(0, limit);
}
