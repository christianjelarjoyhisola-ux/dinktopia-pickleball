"use client";

import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Booking, Court, CourtBlock } from "./management-adapter";
import styles from "./calendar-view.module.css";

export type CalendarDayData = {
  bookings: Booking[];
  blocks: CourtBlock[];
};

export type CalendarViewProps = {
  courts: Court[];
  initialBookings: Booking[];
  initialBlocks: CourtBlock[];
  loadDay: (date: string) => Promise<CalendarDayData>;
  canBlock: boolean;
  onOpenBlocks: () => void;
  timezone?: string;
  currency?: string;
};

type LoadPhase = "loading" | "ready" | "error";

type AgendaEntry =
  | { kind: "booking"; booking: Booking; startMinutes: number }
  | { kind: "block"; block: CourtBlock; startMinutes: number };

type CourtGroup = {
  key: string;
  name: string;
  detail: string;
  status: Court["status"] | "all" | "unassigned";
  entries: AgendaEntry[];
  global?: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})/;
const TERMINAL_HIDDEN_STATUSES = new Set<Booking["status"]>([
  "cancelled",
  "expired",
]);
const HOLD_STATUSES = new Set<Booking["status"]>([
  "awaiting_receipt",
  "receipt_processing",
  "payment_review",
  "payment_attention",
]);

const STATUS_LABEL: Record<Booking["status"], string> = {
  confirmed: "Confirmed",
  awaiting_receipt: "Awaiting receipt",
  receipt_processing: "Receipt processing",
  payment_review: "Payment review",
  payment_attention: "Payment needs attention",
  checked_in: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const PAYMENT_LABEL: Record<Booking["payment"], string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  rejected: "Rejected",
  unknown: "Not returned",
};

function calendarDateIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readableDate(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function minutesFromClock(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59
    ? hour * 60 + minute
    : Number.MAX_SAFE_INTEGER;
}

function minutesFromDisplayTime(value: string): number {
  if (value === "All day") return -1;
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(value);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function amountLabel(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-PH")}`;
  }
}

function rowsForDate(
  date: string,
  bookings: Booking[],
  blocks: CourtBlock[],
): CalendarDayData {
  return {
    bookings: bookings.filter(
      (booking) =>
        booking.bookingDate === date &&
        !TERMINAL_HIDDEN_STATUSES.has(booking.status),
    ),
    blocks: blocks.filter((block) => block.dateValue === date),
  };
}

function bookingEntry(booking: Booking): AgendaEntry {
  return {
    kind: "booking",
    booking,
    startMinutes:
      minutesFromClock(booking.startTime) === Number.MAX_SAFE_INTEGER
        ? minutesFromDisplayTime(booking.time)
        : minutesFromClock(booking.startTime),
  };
}

function blockEntry(block: CourtBlock): AgendaEntry {
  return {
    kind: "block",
    block,
    startMinutes: minutesFromDisplayTime(block.time),
  };
}

function sortEntries(entries: AgendaEntry[]): AgendaEntry[] {
  return [...entries].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes) {
      return left.startMinutes - right.startMinutes;
    }
    const leftLabel = left.kind === "booking" ? left.booking.customer : left.block.publicLabel;
    const rightLabel = right.kind === "booking" ? right.booking.customer : right.block.publicLabel;
    return leftLabel.localeCompare(rightLabel);
  });
}

function courtGroups(
  courts: Court[],
  bookings: Booking[],
  blocks: CourtBlock[],
  courtFilter: string,
): CourtGroup[] {
  const selectedCourts = courtFilter === "all"
    ? [...courts].sort((left, right) => left.sortOrder - right.sortOrder)
    : courts.filter((court) => court.id === courtFilter);
  const allCourtBlocks = blocks.filter((block) => normalized(block.court) === "all courts");
  const matchedBookingIds = new Set<string>();
  const matchedBlockIds = new Set<string>(allCourtBlocks.map((block) => block.id));
  const groups: CourtGroup[] = [];

  if (allCourtBlocks.length) {
    groups.push({
      key: "all-courts",
      name: "All courts",
      detail: "Venue-wide restriction",
      status: "all",
      global: true,
      entries: sortEntries(allCourtBlocks.map(blockEntry)),
    });
  }

  for (const court of selectedCourts) {
    const courtBookings = bookings.filter((booking) => booking.courtId === court.id);
    const courtBlocks = blocks.filter((block) => normalized(block.court) === normalized(court.name));
    courtBookings.forEach((booking) => matchedBookingIds.add(booking.bookingId));
    courtBlocks.forEach((block) => matchedBlockIds.add(block.id));
    groups.push({
      key: court.id,
      name: court.name,
      detail: court.surface || court.description || "Configured court",
      status: court.status,
      entries: sortEntries([
        ...courtBookings.map(bookingEntry),
        ...courtBlocks.map(blockEntry),
      ]),
    });
  }

  if (courtFilter === "all") {
    const unmatchedBookings = bookings.filter(
      (booking) => !matchedBookingIds.has(booking.bookingId),
    );
    const unmatchedBlocks = blocks.filter((block) => !matchedBlockIds.has(block.id));
    const unmatchedLabels = new Set([
      ...unmatchedBookings.map((booking) => booking.court || "Unassigned court"),
      ...unmatchedBlocks.map((block) => block.court || "Unassigned court"),
    ]);

    for (const label of unmatchedLabels) {
      const entries = sortEntries([
        ...unmatchedBookings
          .filter((booking) => booking.court === label)
          .map(bookingEntry),
        ...unmatchedBlocks
          .filter((block) => block.court === label)
          .map(blockEntry),
      ]);
      if (!entries.length) continue;
      groups.push({
        key: `unassigned-${label}`,
        name: label,
        detail: "Court record not in the loaded inventory",
        status: "unassigned",
        entries,
      });
    }
  }

  return groups;
}

function courtStatusLabel(status: CourtGroup["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "maintenance":
      return "Maintenance";
    case "inactive":
      return "Inactive";
    case "all":
      return "Venue-wide";
    case "unassigned":
      return "Unassigned";
  }
}

function bookingDateTime(booking: Booking, fallbackDate: string): string {
  const date = booking.bookingDate ?? fallbackDate;
  if (!booking.startTime) return date;
  const clock = booking.startTime.slice(0, 5);
  return `${date}T${clock}`;
}

function BookingAgendaItem({
  booking,
  selectedDate,
  currency,
}: {
  booking: Booking;
  selectedDate: string;
  currency: string;
}) {
  const isHold = HOLD_STATUSES.has(booking.status);
  const statusTone = booking.status === "payment_attention" ? "attention" : isHold ? "pending" : "stable";
  const paymentTone = booking.payment === "paid"
    ? "paid"
    : booking.payment === "rejected" || booking.payment === "refunded"
      ? "attention"
      : "pending";

  return (
    <article className={`${styles.agendaItem} ${isHold ? styles.holdItem : styles.bookingItem}`}>
      <div className={styles.timeColumn}>
        <time dateTime={bookingDateTime(booking, selectedDate)}>{booking.time}</time>
        <span>{booking.duration}</span>
      </div>
      <div className={styles.entryBody}>
        <div className={styles.entryHeading}>
          <div>
            <span className={styles.kindLabel}>{isHold ? "Hold" : "Booking"}</span>
            {booking.bookingType === "event" ? <span className={styles.secondaryKind}>Event</span> : null}
            <h4>{booking.customer}</h4>
          </div>
          <strong className={styles.amount}>{amountLabel(booking.amount, currency)}</strong>
        </div>
        <p className={styles.reference}>Booking {booking.reference}</p>
        <div className={styles.semanticRow}>
          <span className={`${styles.semanticPill} ${styles[`tone_${statusTone}`]}`}>
            Status: {STATUS_LABEL[booking.status]}
          </span>
          <span className={`${styles.semanticPill} ${styles[`tone_${paymentTone}`]}`}>
            Payment: {PAYMENT_LABEL[booking.payment]}
          </span>
        </div>
      </div>
    </article>
  );
}

function BlockAgendaItem({ block, selectedDate }: { block: CourtBlock; selectedDate: string }) {
  return (
    <article className={`${styles.agendaItem} ${styles.blockItem}`}>
      <div className={styles.timeColumn}>
        <time dateTime={selectedDate}>{block.time}</time>
        <span>Court block</span>
      </div>
      <div className={styles.entryBody}>
        <div className={styles.entryHeading}>
          <div>
            <span className={styles.kindLabel}>Block</span>
            <h4>{block.publicLabel}</h4>
          </div>
          <Ban aria-hidden="true" size={19} strokeWidth={2.2} />
        </div>
        {block.internalReason ? (
          <p className={styles.blockNote}>Private note: {block.internalReason}</p>
        ) : (
          <p className={styles.blockNote}>No internal note</p>
        )}
      </div>
    </article>
  );
}

export function CalendarView({
  courts,
  initialBookings,
  initialBlocks,
  loadDay,
  canBlock,
  onOpenBlocks,
  timezone = "Asia/Manila",
  currency = "PHP",
}: CalendarViewProps) {
  const today = calendarDateIn(timezone);
  const initialRows = rowsForDate(today, initialBookings, initialBlocks);
  const [selectedDate, setSelectedDate] = useState(today);
  const [courtFilter, setCourtFilter] = useState("all");
  const [dayData, setDayData] = useState<CalendarDayData>(initialRows);
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const loadDayRef = useRef(loadDay);
  const requestSequence = useRef(0);

  useEffect(() => {
    loadDayRef.current = loadDay;
  }, [loadDay]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    let active = true;

    void loadDayRef.current(selectedDate)
      .then((result) => {
        if (!active || requestSequence.current !== requestId) return;
        setDayData(rowsForDate(selectedDate, result.bookings, result.blocks));
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active || requestSequence.current !== requestId) return;
        setDayData({ bookings: [], blocks: [] });
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "The schedule could not be loaded for this day.",
        );
        setPhase("error");
      });

    return () => {
      active = false;
    };
  }, [refreshKey, selectedDate]);

  const effectiveCourtFilter =
    courtFilter === "all" || courts.some((court) => court.id === courtFilter)
      ? courtFilter
      : "all";

  const visibleBookings = useMemo(() => {
    if (effectiveCourtFilter === "all") return dayData.bookings;
    return dayData.bookings.filter((booking) => booking.courtId === effectiveCourtFilter);
  }, [dayData.bookings, effectiveCourtFilter]);

  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === effectiveCourtFilter),
    [courts, effectiveCourtFilter],
  );

  const visibleBlocks = useMemo(() => {
    if (effectiveCourtFilter === "all") return dayData.blocks;
    return dayData.blocks.filter((block) => {
      const courtName = normalized(block.court);
      return courtName === "all courts" || courtName === normalized(selectedCourt?.name ?? "");
    });
  }, [dayData.blocks, effectiveCourtFilter, selectedCourt]);

  const groups = useMemo(
    () => courtGroups(courts, visibleBookings, visibleBlocks, effectiveCourtFilter),
    [courts, effectiveCourtFilter, visibleBlocks, visibleBookings],
  );
  const holdCount = visibleBookings.filter((booking) => HOLD_STATUSES.has(booking.status)).length;
  const bookingCount = visibleBookings.length - holdCount;
  const blockCount = visibleBlocks.length;
  const resultCount = bookingCount + holdCount + blockCount;
  const dateHeading = readableDate(selectedDate, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const compactDate = readableDate(selectedDate, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const moveDate = (days: number) => {
    setPhase("loading");
    setErrorMessage("");
    setDayData({ bookings: [], blocks: [] });
    setSelectedDate((current) => shiftCalendarDate(current, days));
  };

  const goToToday = () => {
    const currentToday = calendarDateIn(timezone);
    setPhase("loading");
    setErrorMessage("");
    setDayData({ bookings: [], blocks: [] });
    if (currentToday === selectedDate) {
      setRefreshKey((key) => key + 1);
      return;
    }
    setSelectedDate(currentToday);
  };

  return (
    <section className={styles.calendar} aria-labelledby="calendar-view-title" aria-busy={phase === "loading"}>
      <header className={styles.calendarHeader}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <h2 id="calendar-view-title">
              <time dateTime={selectedDate}>{dateHeading}</time>
            </h2>
          </div>
          <button
            type="button"
            className={styles.blockButton}
            onClick={onOpenBlocks}
            disabled={!canBlock}
            title={canBlock ? undefined : "Your account cannot block court time"}
          >
            <Ban aria-hidden="true" size={18} />
            Block court time
          </button>
        </div>

        <div className={styles.toolbar} aria-label="Calendar controls">
          <div className={styles.dayNavigation}>
            <button type="button" onClick={() => moveDate(-1)} aria-label="Previous day">
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
            <button type="button" className={styles.todayButton} onClick={goToToday}>
              Today
            </button>
            <button type="button" onClick={() => moveDate(1)} aria-label="Next day">
              <ChevronRight aria-hidden="true" size={20} />
            </button>
          </div>

          <label className={styles.control}>
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (!DATE_PATTERN.test(event.target.value)) return;
                setPhase("loading");
                setErrorMessage("");
                setDayData({ bookings: [], blocks: [] });
                if (event.target.value === selectedDate) {
                  setRefreshKey((key) => key + 1);
                } else {
                  setSelectedDate(event.target.value);
                }
              }}
            />
          </label>

          <label className={styles.control}>
            <span>Court</span>
            <select value={effectiveCourtFilter} onChange={(event) => setCourtFilter(event.target.value)}>
              <option value="all">All courts</option>
              {[...courts]
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((court) => (
                  <option key={court.id} value={court.id}>{court.name}</option>
                ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              setPhase("loading");
              setErrorMessage("");
              setDayData({ bookings: [], blocks: [] });
              setRefreshKey((key) => key + 1);
            }}
            disabled={phase === "loading"}
            aria-label={`Refresh schedule for ${compactDate}`}
          >
            <RefreshCw aria-hidden="true" size={18} className={phase === "loading" ? styles.spinning : undefined} />
            Refresh
          </button>
        </div>
      </header>

      <div className={styles.summaryStrip}>
        <dl className={styles.summary}>
          <div><dt>Bookings</dt><dd>{bookingCount}</dd></div>
          <div><dt>Payment holds</dt><dd>{holdCount}</dd></div>
          <div><dt>Court blocks</dt><dd>{blockCount}</dd></div>
        </dl>

        <div className={styles.resultBar}>
          <div>
            <Clock3 aria-hidden="true" size={17} />
            <span>{timezone}</span>
            <span aria-hidden="true">·</span>
            <strong>{selectedCourt?.name ?? "All courts"}</strong>
          </div>
          <p role="status" aria-live="polite">
            {phase === "loading"
              ? `Loading ${compactDate}…`
              : phase === "error"
                ? "Schedule unavailable"
                : `${resultCount} ${resultCount === 1 ? "entry" : "entries"}`}
          </p>
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {phase === "loading"
          ? `Loading schedule for ${dateHeading}.`
          : phase === "error"
            ? `Could not load schedule for ${dateHeading}.`
            : `${resultCount} schedule ${resultCount === 1 ? "entry" : "entries"} loaded for ${dateHeading}.`}
      </p>

      {phase === "loading" ? (
        <div className={styles.loadingState} role="presentation">
          <span />
          <span />
        </div>
      ) : phase === "error" ? (
        <div className={styles.errorState} role="alert">
          <strong>We could not load this day</strong>
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setPhase("loading");
              setErrorMessage("");
              setDayData({ bookings: [], blocks: [] });
              setRefreshKey((key) => key + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : resultCount === 0 ? (
        <div className={styles.emptyState}>
          <CalendarDays aria-hidden="true" size={28} />
          <strong>No schedule entries returned</strong>
          <p>
            {selectedCourt
              ? `There are no bookings or blocks for ${selectedCourt.name} on this loaded day.`
              : "There are no bookings, payment holds, or court blocks for this loaded day."}
          </p>
        </div>
      ) : (
        <div className={styles.courtBoard} aria-label={`Court agenda for ${dateHeading}`}>
          {groups.map((group) => (
            <section
              className={`${styles.courtCard} ${group.global ? styles.globalCourtCard : ""}`}
              key={group.key}
              aria-labelledby={`court-group-${group.key}`}
            >
              <header className={styles.courtHeader}>
                <div>
                  <h3 id={`court-group-${group.key}`}>{group.name}</h3>
                  <p>{group.detail}</p>
                </div>
                <div className={styles.courtMeta}>
                  <span className={`${styles.courtStatus} ${styles[`court_${group.status}`]}`}>
                    {courtStatusLabel(group.status)}
                  </span>
                  <strong>{group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</strong>
                </div>
              </header>
              {group.entries.length ? (
                <div className={styles.agendaList}>
                  {group.entries.map((entry) =>
                    entry.kind === "booking" ? (
                      <BookingAgendaItem
                        key={`booking-${entry.booking.bookingId}`}
                        booking={entry.booking}
                        selectedDate={selectedDate}
                        currency={currency}
                      />
                    ) : (
                      <BlockAgendaItem
                        key={`block-${entry.block.id}`}
                        block={entry.block}
                        selectedDate={selectedDate}
                      />
                    ),
                  )}
                </div>
              ) : (
                <p className={styles.courtEmpty}>No bookings or blocks returned for this court.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export default CalendarView;
