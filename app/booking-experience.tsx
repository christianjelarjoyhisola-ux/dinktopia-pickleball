"use client";

import Image from "next/image";
import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { activeTenant } from "./tenants/registry";
import {
  bookingStatus,
  cancelUnpaidBooking,
  createBooking as createPlatformBooking,
  getAvailability as getPlatformAvailability,
  getTenantBootstrap,
  platformMode,
  submitPaymentReceipt,
  turnstileSiteKey,
} from "./lib/platform/client";
import type {
  BookingConfirmation,
  PaymentMethod,
  PublicCourt,
  TenantBootstrap,
} from "./lib/platform/types";

type Court = {
  id: string;
  number: string;
  name: string;
  descriptor: string;
  mood: string;
  color: "blue" | "coral";
};

type SlotStatus = "available" | "limited" | "unavailable";

export type AvailabilitySlot = {
  hour: number;
  startsAt: string;
  endsAt: string;
  price: number;
  status: SlotStatus;
};

export type AvailabilityRequest = {
  tenantSlug: "dinktopia";
  date: string;
  courtId: string;
  durationHours: number;
};

export type CustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
  updates: boolean;
};

export type BookingRecord = {
  reference: string;
  status: "pending_payment" | "payment_review" | "confirmed" | "cancelled";
  expiresAt?: string | null;
  date: string;
  courtId: string;
  startHour: number;
  durationHours: number;
  amount: number;
  subtotalAmount?: number;
  serviceFeeAmount?: number;
  customer: CustomerDetails;
};

export type BookingHoldRequest = {
  tenantSlug: "dinktopia";
  date: string;
  courtId: string;
  startHour: number;
  durationHours: number;
  amount: number;
  customer: CustomerDetails;
  policyVersion: string | null;
  turnstileToken?: string;
  clientRequestId: string;
};

export type BookingPaymentRequest = {
  booking: BookingRecord;
  paymentReference: string;
  receiptFileName: string;
  receiptFile: File;
  paymentMethod: string;
  clientRequestId: string;
};

export type BookingAdapter = {
  getAvailability: (
    request: AvailabilityRequest,
  ) => Promise<AvailabilitySlot[]>;
  createHold: (request: BookingHoldRequest) => Promise<BookingRecord>;
  submitPayment: (request: BookingPaymentRequest) => Promise<BookingRecord>;
  findBooking: (reference: string, email: string) => Promise<BookingRecord | null>;
  cancelBooking: (reference: string, reason: string) => Promise<BookingRecord>;
};

export type BookingExperienceProps = {
  adapter?: BookingAdapter;
};

const previewCourts: Court[] = activeTenant.previewCourts.map((court, index) => ({
  id: court.id,
  number: String(index + 1).padStart(2, "0"),
  name: court.name,
  descriptor: court.surface,
  mood: court.description,
  color: index === 0 ? "blue" : "coral",
}));

function displayCourtsFromPlatform(publicCourts: PublicCourt[]): Court[] {
  return publicCourts.map((court, index) => ({
    id: court.id,
    number: String(index + 1).padStart(2, "0"),
    name: court.name,
    descriptor: court.description || "Pickleball court",
    mood: court.description || "Configured for Dinktopia play",
    color: index % 2 === 0 ? "blue" : "coral",
  }));
}

const seededCustomer: CustomerDetails = {
  fullName: "Mika Santos",
  email: "mika@example.com",
  phone: "+63 917 555 0142",
  updates: true,
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function formatHour(hour: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value}:00 ${period}`;
}

function getPrice(startHour: number, durationHours: number) {
  return Array.from({ length: durationHours }, (_, index) => startHour + index)
    .map((hour) =>
      hour >= Number(activeTenant.booking.offPeakEndsAt.slice(0, 2))
        ? activeTenant.booking.peakHourlyRate
        : activeTenant.booking.offPeakHourlyRate,
    )
    .reduce((total, price) => total + price, 0);
}

function getConfiguredPrice(
  court: PublicCourt | undefined,
  startHour: number,
  durationHours: number,
) {
  const pricingConfig = court?.pricingConfig as
    | { regular?: { bands?: Array<{ start?: string; end?: string; hourlyRate?: number }> } }
    | undefined;
  const bands = pricingConfig?.regular?.bands;
  if (!bands?.length) {
    if (platformMode() === "live") {
      throw new Error("Court pricing is not available yet.");
    }
    return getPrice(startHour, durationHours);
  }

  return Array.from({ length: durationHours }, (_, index) => startHour + index).reduce(
    (total, hour) => {
      const band = bands.find((candidate) => {
        const start = Number(candidate.start?.slice(0, 2));
        const end = Number(candidate.end?.slice(0, 2));
        return Number.isFinite(start) && Number.isFinite(end) && hour >= start && hour < end;
      });
      if (typeof band?.hourlyRate !== "number") {
        throw new Error("Court pricing is incomplete for this time.");
      }
      return total + band.hourlyRate;
    },
    0,
  );
}

function blockedPeriodOverlaps(
  blockedDates: Array<Record<string, unknown>> | undefined,
  courtId: string,
  startHour: number,
  durationHours: number,
) {
  return (blockedDates ?? []).some((block) => {
    const blockCourtId = block.courtId ?? block.court_id;
    const appliesToCourt = !blockCourtId || blockCourtId === courtId;
    if (!appliesToCourt) return false;
    const startsAt = block.startsAt ?? block.starts_at;
    const endsAt = block.endsAt ?? block.ends_at;
    if (startsAt == null && endsAt == null) return true;
    if (typeof startsAt !== "string" || typeof endsAt !== "string") return true;
    const blockedStart = hourFromTimestamp(startsAt);
    const blockedEnd = hourFromTimestamp(endsAt);
    return startHour < blockedEnd && startHour + durationHours > blockedStart;
  });
}

function hourFromTimestamp(value: string) {
  const timePart = value.includes("T") ? (value.split("T")[1] ?? "00:00") : value;
  return Number(timePart.slice(0, 2));
}

function mappedBookingStatus(
  value: unknown,
  fallback: BookingRecord["status"],
): BookingRecord["status"] {
  if (value === "confirmed") return "confirmed";
  if (value === "payment_review" || value === "under_review") return "payment_review";
  if (value === "pending_payment" || value === "pending") return "pending_payment";
  if (value === "cancelled" || value === "expired") return "cancelled";
  return fallback;
}

function isStoredBookingRecord(value: unknown): value is BookingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<BookingRecord>;
  const customer = record.customer as Partial<CustomerDetails> | undefined;
  return (
    typeof record.reference === "string" &&
    record.reference.length > 0 &&
    ["pending_payment", "payment_review", "confirmed", "cancelled"].includes(
      record.status ?? "",
    ) &&
    typeof record.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    typeof record.courtId === "string" &&
    Number.isFinite(record.startHour) &&
    (record.startHour ?? -1) >= 0 &&
    (record.startHour ?? 24) < 24 &&
    Number.isFinite(record.durationHours) &&
    (record.durationHours ?? 0) > 0 &&
    (record.startHour ?? 24) + (record.durationHours ?? 24) <= 24 &&
    Number.isFinite(record.amount) &&
    (record.amount ?? -1) >= 0 &&
    (record.subtotalAmount === undefined ||
      Number.isFinite(record.subtotalAmount)) &&
    (record.serviceFeeAmount === undefined ||
      Number.isFinite(record.serviceFeeAmount)) &&
    (!record.expiresAt ||
      (typeof record.expiresAt === "string" &&
        Number.isFinite(Date.parse(record.expiresAt)))) &&
    typeof customer?.fullName === "string" &&
    typeof customer.email === "string" &&
    typeof customer.phone === "string" &&
    typeof customer.updates === "boolean"
  );
}

function formatHoldCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readStoredBooking(reference: string): {
  record: BookingRecord;
  token: string;
} | null {
  try {
    const stored = sessionStorage.getItem(`dinktopia:booking:${reference}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { record?: unknown; token?: unknown };
    if (
      !isStoredBookingRecord(parsed.record) ||
      parsed.record.reference !== reference ||
      typeof parsed.token !== "string" ||
      !parsed.token
    ) {
      return null;
    }
    return { record: parsed.record, token: parsed.token };
  } catch {
    return null;
  }
}

const platformAdapter: BookingAdapter = {
  async getAvailability(request) {
    const [response, tenantBootstrap] = await Promise.all([
      getPlatformAvailability(request.date),
      getTenantBootstrap(),
    ]);
    const availabilityCourt = response.courts.find((item) => item.id === request.courtId);
    const publicCourt = tenantBootstrap.courts.find((item) => item.id === request.courtId);
    if (!availabilityCourt || !publicCourt) {
      throw new Error("This court is not available in the current tenant schedule.");
    }
    const openingHour = Number(publicCourt.opensAt.slice(0, 2));
    const closingHour = Number(publicCourt.closesAt.slice(0, 2));
    const publicConfig = publicCourt.publicConfig as
      | { minimumLeadMinutes?: number }
      | undefined;
    const minimumLeadMinutes =
      publicConfig?.minimumLeadMinutes ?? activeTenant.booking.minimumLeadMinutes;

    return Array.from(
      { length: closingHour - openingHour - request.durationHours + 1 },
      (_, index) => index + openingHour,
    ).map((hour) => {
      const overlapsBooking = availabilityCourt.unavailable.some((blocked) => {
        const blockedStart = hourFromTimestamp(blocked.startsAt);
        const blockedEnd = hourFromTimestamp(blocked.endsAt);
        return hour < blockedEnd && hour + request.durationHours > blockedStart;
      });
      const overlapsBlock = blockedPeriodOverlaps(
        response.blockedDates,
        request.courtId,
        hour,
        request.durationHours,
      );
      const popular = (hour + Number(request.date.slice(-2))) % 5 === 0;
      const candidateStartsAt = new Date(
        `${request.date}T${String(hour).padStart(2, "0")}:00:00+08:00`,
      ).getTime();
      const tooSoon =
        candidateStartsAt < Date.now() + minimumLeadMinutes * 60 * 1000;
      return {
        hour,
        startsAt: formatHour(hour),
        endsAt: formatHour(hour + request.durationHours),
        price: getConfiguredPrice(publicCourt, hour, request.durationHours),
        status:
          tooSoon || overlapsBlock || overlapsBooking
            ? "unavailable"
            : popular
              ? "limited"
              : "available",
      };
    });
  },
  async createHold(request) {
    const pendingKey = `dinktopia:pending:${request.clientRequestId}`;
    const probeKey = `dinktopia:storage-probe:${request.clientRequestId}`;
    try {
      sessionStorage.setItem(probeKey, "available");
      sessionStorage.removeItem(probeKey);
    } catch {
      throw new Error(
        "Secure booking recovery is unavailable in this browser. Enable session storage before reserving a court.",
      );
    }

    // The server owns idempotency. Replaying this UUID is safer than trusting a
    // cached browser response after an ambiguous network failure.
    const confirmation: BookingConfirmation = await createPlatformBooking({
      courtId: request.courtId,
      bookingDate: request.date,
      startTime: `${String(request.startHour).padStart(2, "0")}:00`,
      durationHours: request.durationHours,
      bookingType: "regular",
      customer: {
        name: request.customer.fullName,
        email: request.customer.email,
        phone: request.customer.phone,
      },
      policyAccepted: true,
      policyVersion: request.policyVersion,
      clientRequestId: request.clientRequestId,
      turnstileToken: request.turnstileToken,
    });

    if (
      !confirmation.reference ||
      !confirmation.bookingToken ||
      !Number.isFinite(confirmation.subtotalAmount) ||
      !Number.isFinite(confirmation.serviceFeeAmount) ||
      !Number.isFinite(confirmation.totalAmount) ||
      confirmation.subtotalAmount < 0 ||
      confirmation.serviceFeeAmount < 0 ||
      confirmation.totalAmount < 0
    ) {
      throw new Error(
        "The booking server returned an incomplete hold. Payment remains disabled.",
      );
    }
    const confirmationExpiry = confirmation.expiresAt
      ? Date.parse(confirmation.expiresAt)
      : Number.NaN;
    const confirmationStatus = mappedBookingStatus(
      confirmation.status,
      "cancelled",
    );
    if (
      platformMode() === "live" &&
      confirmationStatus !== "pending_payment"
    ) {
      throw new Error(
        "The server says this booking is no longer awaiting payment. Payment remains disabled.",
      );
    }
    if (
      platformMode() === "live" &&
      (!Number.isFinite(confirmationExpiry) || confirmationExpiry <= Date.now())
    ) {
      try {
        await cancelUnpaidBooking(
          confirmation.reference,
          confirmation.bookingToken,
        );
      } catch {
        // A malformed or expired server hold must never unlock payment controls.
      }
      throw new Error(
        "The booking server did not provide an active expiry window. Payment remains disabled.",
      );
    }

    const record: BookingRecord = {
      reference: confirmation.reference,
      status: "pending_payment",
      expiresAt: confirmation.expiresAt ?? null,
      date: request.date,
      courtId: request.courtId,
      startHour: request.startHour,
      durationHours: request.durationHours,
      amount: confirmation.totalAmount,
      subtotalAmount: confirmation.subtotalAmount,
      serviceFeeAmount: confirmation.serviceFeeAmount,
      customer: request.customer,
    };

    const bookingKey = `dinktopia:booking:${record.reference}`;
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(confirmation));
      sessionStorage.setItem(
        bookingKey,
        JSON.stringify({ record, token: confirmation.bookingToken }),
      );
      sessionStorage.setItem(
        "dinktopia:active-hold",
        JSON.stringify({
          reference: record.reference,
          clientRequestId: request.clientRequestId,
        }),
      );
    } catch {
      try {
        sessionStorage.removeItem(pendingKey);
        sessionStorage.removeItem(bookingKey);
        sessionStorage.removeItem("dinktopia:active-hold");
      } catch {
        // Continue to the best-effort server release below.
      }
      try {
        await cancelUnpaidBooking(record.reference, confirmation.bookingToken);
      } catch {
        // The server-controlled expiry still prevents an indefinite hold.
      }
      throw new Error(
        "The hold could not be saved safely and payment remains disabled. Refresh before trying again.",
      );
    }
    return record;
  },
  async submitPayment(request) {
    if (
      platformMode() === "preview" &&
      request.paymentReference.replace(/\s/g, "").endsWith("000000")
    ) {
      throw new Error(
        "Preview validation could not match that sample reference. No payment was attempted.",
      );
    }
    const storageKey = `dinktopia:booking:${request.booking.reference}`;
    const parsed = readStoredBooking(request.booking.reference);
    if (!parsed) {
      throw new Error("This payment hold is no longer available. Start a new booking.");
    }
    if (parsed.record.status !== "pending_payment") {
      throw new Error("This booking is no longer awaiting payment.");
    }
    const current = await bookingStatus(parsed.record.reference, parsed.token);
    const currentBooking = current.booking as
      | { status?: string; expiresAt?: string | null; expires_at?: string | null }
      | undefined;
    if (platformMode() === "live") {
      const currentStatus = mappedBookingStatus(currentBooking?.status, parsed.record.status);
      const expiresAt = currentBooking?.expiresAt ?? currentBooking?.expires_at ?? parsed.record.expiresAt;
      const expiresAtTime = expiresAt ? Date.parse(expiresAt) : null;
      if (
        currentStatus !== "pending_payment" ||
        expiresAtTime === null ||
        !Number.isFinite(expiresAtTime) ||
        expiresAtTime <= Date.now()
      ) {
        throw new Error("This payment hold has expired or is no longer awaiting payment. Choose a new time.");
      }
    }
    const receipt = await submitPaymentReceipt({
      reference: parsed.record.reference,
      token: parsed.token,
      method: request.paymentMethod,
      paymentReference: request.paymentReference,
      file: request.receiptFile,
    });
    const receiptBooking = receipt.booking as { status?: string } | undefined;
    const outcome = typeof receipt.outcome === "string" ? receipt.outcome : "manual_review";
    const record = {
      ...parsed.record,
      status: outcome === "auto_approved"
        ? "confirmed" as const
        : mappedBookingStatus(receiptBooking?.status, "payment_review"),
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...parsed, record }));
      sessionStorage.removeItem(`dinktopia:pending:${request.clientRequestId}`);
      sessionStorage.removeItem("dinktopia:active-hold");
    } catch {
      // The server response is authoritative; returning it prevents duplicate uploads.
    }
    return record;
  },
  async findBooking(reference, email) {
    const normalizedReference = reference.trim().toUpperCase();
    const parsed = readStoredBooking(normalizedReference);
    if (parsed) {
      if (parsed.record.customer.email.toLowerCase() !== email.trim().toLowerCase()) {
        return null;
      }
      const current = await bookingStatus(normalizedReference, parsed.token);
      const currentBooking = current.booking as
        | { status?: string; expiresAt?: string | null; expires_at?: string | null }
        | undefined;
      const record = {
        ...parsed.record,
        expiresAt: currentBooking?.expiresAt ?? currentBooking?.expires_at ?? parsed.record.expiresAt,
        status: mappedBookingStatus(currentBooking?.status, parsed.record.status),
      };
      try {
        sessionStorage.setItem(
          `dinktopia:booking:${normalizedReference}`,
          JSON.stringify({ ...parsed, record }),
        );
      } catch {
        // The verified server status can still be shown for this session.
      }
      return record;
    }

    await delay(450);
    if (
      platformMode() !== "preview" ||
      normalizedReference !== "DT-260808-018" ||
      email.trim().toLowerCase() !== "mika@example.com"
    ) return null;
    return {
      reference: "DT-260808-018",
      status: "pending_payment",
      date: "2026-08-16",
      courtId: previewCourts[0].id,
      startHour: 18,
      durationHours: 2,
      amount: 800,
      customer: seededCustomer,
    };
  },
  async cancelBooking(reference) {
    const parsed = readStoredBooking(reference);
    if (parsed) {
      await cancelUnpaidBooking(reference, parsed.token);
      const cancelled = { ...parsed.record, status: "cancelled" as const };
      try {
        sessionStorage.setItem(
          `dinktopia:booking:${reference}`,
          JSON.stringify({ ...parsed, record: cancelled }),
        );
        const activeHold = sessionStorage.getItem("dinktopia:active-hold");
        if (activeHold) {
          const pointer = JSON.parse(activeHold) as { reference?: unknown };
          if (pointer.reference === reference) {
            sessionStorage.removeItem("dinktopia:active-hold");
          }
        }
      } catch {
        // The authoritative cancellation already succeeded server-side.
      }
      return cancelled;
    }
    if (platformMode() !== "preview") {
      throw new Error("This booking can no longer be cancelled online.");
    }
    await delay(450);
    return {
      reference,
      status: "cancelled",
      date: "2026-08-16",
      courtId: previewCourts[0].id,
      startHour: 18,
      durationHours: 2,
      amount: 800,
      customer: seededCustomer,
    };
  },
};

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(Date.UTC(getPart("year"), getPart("month") - 1, getPart("day"), 12));
}

function getDateOptions(count = 14) {
  const today = getManilaToday();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);

    return {
      iso,
      day: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
      date: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        timeZone: "UTC",
      }).format(date),
      month: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
      long: new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
      isToday: index === 0,
    };
  });
}

function peso(amount: number) {
  const hasCentavos = Math.abs(amount - Math.round(amount)) > 0.0001;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function calculateBookingFee(
  bookingFee: TenantBootstrap["bookingFee"],
  subtotal: number,
  durationHours: number,
) {
  const amount = bookingFee?.feeAmount ?? 0;
  if (!amount) return 0;
  switch (bookingFee?.feeMode) {
    case "fixed_per_booking":
      return amount;
    case "fixed_per_hour":
      return amount * durationHours;
    case "percentage":
      return Math.round(subtotal * amount) / 100;
    default:
      return null;
  }
}

const fieldErrorId = (id: string, field: string) => `${id}-${field}-error`;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function BookingExperience({
  adapter = platformAdapter,
}: BookingExperienceProps) {
  const isLive = platformMode() === "live";
  const [dateHorizon, setDateHorizon] = useState<number>(activeTenant.booking.maximumAdvanceDays);
  const dates = useMemo(() => getDateOptions(Math.min(Math.max(dateHorizon + 1, 2), 31)), [dateHorizon]);
  const formId = useId();
  const bookingSectionRef = useRef<HTMLElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const bookingAttemptIdRef = useRef("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [mode, setMode] = useState<"book" | "manage">("book");
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedDate, setSelectedDate] = useState(dates[1]?.iso ?? "");
  const [selectedCourtId, setSelectedCourtId] = useState(previewCourts[0].id);
  const [duration, setDuration] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityState, setAvailabilityState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: "",
    email: "",
    phone: "",
    updates: true,
  });
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [detailErrors, setDetailErrors] = useState<Partial<Record<keyof CustomerDetails, string>>>({});
  const [paymentReference, setPaymentReference] = useState("");
  const [receiptFileName, setReceiptFileName] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<BookingRecord | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);
  const [holdNow, setHoldNow] = useState(() => Date.now());
  const [liveMessage, setLiveMessage] = useState("");
  const [bootstrap, setBootstrap] = useState<TenantBootstrap | null>(null);
  const [bootstrapState, setBootstrapState] = useState<"loading" | "ready" | "error">("loading");
  const [turnstileTokenValue, setTurnstileTokenValue] = useState("");

  const [lookupReference, setLookupReference] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "empty" | "error"
  >("idle");
  const [managedBooking, setManagedBooking] = useState<BookingRecord | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showRescheduleHelp, setShowRescheduleHelp] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelState, setCancelState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const displayCourts = useMemo(
    () =>
      isLive && bootstrap?.courts.length
        ? displayCourtsFromPlatform(bootstrap.courts)
        : previewCourts,
    [bootstrap, isLive],
  );
  const selectedCourt =
    displayCourts.find((court) => court.id === selectedCourtId) ?? displayCourts[0];
  const selectedPublicCourt = bootstrap?.courts.find((court) => court.id === selectedCourtId);
  const selectedPricing = selectedPublicCourt?.pricingConfig as
    | { regular?: { minimumHours?: number; maximumHours?: number } }
    | undefined;
  const minimumDuration =
    selectedPricing?.regular?.minimumHours ?? activeTenant.booking.minimumHours;
  const maximumDuration =
    selectedPricing?.regular?.maximumHours ?? activeTenant.booking.maximumHours;
  const durationOptions = Array.from(
    { length: Math.max(1, maximumDuration - minimumDuration + 1) },
    (_, index) => minimumDuration + index,
  );
  const selectedDateDetails = dates.find((date) => date.iso === selectedDate);
  const availableCount = slots.filter((slot) => slot.status !== "unavailable").length;
  const courtSubtotal = selectedSlot?.price ?? 0;
  const securitySiteKey = turnstileSiteKey();
  const paymentMethod: PaymentMethod | null = bootstrap?.paymentMethods[0] ?? null;
  const paymentMethodCode = paymentMethod?.methodCode ?? paymentMethod?.code ?? "gcash";
  const paymentLabel = paymentMethod?.displayName ?? "GCash";
  const paymentQrUrl = paymentMethod?.qrImageUrl ?? paymentMethod?.qrUrl ?? null;
  const rawPolicy = (bootstrap?.settings?.refund_reschedule_policy ??
    bootstrap?.refundReschedulePolicy ??
    null) as Record<string, unknown> | null;
  const policyVersion = typeof rawPolicy?.version === "string" ? rawPolicy.version : null;
  const policyTitle =
    typeof rawPolicy?.title === "string" ? rawPolicy.title : "Booking and cancellation rules";
  const policyIntro =
    typeof rawPolicy?.intro === "string"
      ? rawPolicy.intro
      : activeTenant.booking.cancellation;
  const policyContent =
    typeof rawPolicy?.content === "string" ? rawPolicy.content : activeTenant.booking.rescheduling;
  const bookingFee = calculateBookingFee(bootstrap?.bookingFee, courtSubtotal, duration);
  const total = courtSubtotal + (bookingFee ?? 0);
  const checkoutSlot: AvailabilitySlot | null =
    selectedSlot ??
    (pendingBooking
      ? {
          hour: pendingBooking.startHour,
          startsAt: formatHour(pendingBooking.startHour),
          endsAt: formatHour(
            pendingBooking.startHour + pendingBooking.durationHours,
          ),
          price:
            pendingBooking.subtotalAmount ??
            Math.max(
              0,
              pendingBooking.amount - (pendingBooking.serviceFeeAmount ?? 0),
            ),
          status: "available",
        }
      : null);
  const checkoutDuration = pendingBooking?.durationHours ?? duration;
  const checkoutSubtotal =
    pendingBooking?.subtotalAmount ?? checkoutSlot?.price ?? courtSubtotal;
  const checkoutFee =
    pendingBooking?.serviceFeeAmount ??
    (pendingBooking ? Math.max(0, pendingBooking.amount - checkoutSubtotal) : bookingFee ?? 0);
  const checkoutTotal = pendingBooking?.amount ?? total;
  const holdExpiryTimestamp = pendingBooking?.expiresAt
    ? Date.parse(pendingBooking.expiresAt)
    : Number.NaN;
  const holdExpired = Boolean(
    pendingBooking &&
      (pendingBooking.status !== "pending_payment" ||
        (Number.isFinite(holdExpiryTimestamp) && holdExpiryTimestamp <= holdNow)),
  );
  const holdRemainingSeconds =
    pendingBooking && Number.isFinite(holdExpiryTimestamp) && !holdExpired
      ? Math.max(0, Math.ceil((holdExpiryTimestamp - holdNow) / 1000))
      : null;
  const liveBookingReady =
    !isLive ||
    (bootstrapState === "ready" &&
      bootstrap?.readiness.publicBookingEnabled === true &&
      Boolean(paymentMethod) &&
      Boolean(policyVersion) &&
      Boolean(securitySiteKey) &&
      bookingFee !== null);
  const heldPaymentReady =
    !isLive ||
    (bootstrapState === "ready" &&
      bootstrap?.readiness.publicBookingEnabled === true &&
      Boolean(paymentMethod));

  useEffect(() => {
    let active = true;
    getTenantBootstrap()
      .then((result) => {
        if (!active) return;
        setBootstrap(result);
        if (isLive && result.courts.length) {
          setSelectedCourtId((current) =>
            result.courts.some((court) => court.id === current)
              ? current
              : result.courts[0].id,
          );
          const publicConfig = result.courts[0].publicConfig as
            | { maximumAdvanceDays?: number }
            | undefined;
          if (typeof publicConfig?.maximumAdvanceDays === "number") {
            setDateHorizon(publicConfig.maximumAdvanceDays);
          }
          const pricingConfig = result.courts[0].pricingConfig as
            | { regular?: { minimumHours?: number } }
            | undefined;
          if (typeof pricingConfig?.regular?.minimumHours === "number") {
            setDuration(pricingConfig.regular.minimumHours);
          }
        }
        setBootstrapState("ready");
      })
      .catch(() => {
        if (!active) return;
        setBootstrap(null);
        setBootstrapState("error");
      });
    return () => {
      active = false;
    };
  }, [isLive]);

  useEffect(() => {
    if (adapter !== platformAdapter) return;
    let active = true;

    const restoreActiveHold = async () => {
      let pointer: { reference: string; clientRequestId: string };
      let parsed: { record: BookingRecord; token: string };

      try {
        const pointerValue = sessionStorage.getItem("dinktopia:active-hold");
        if (!pointerValue) return;
        const candidatePointer = JSON.parse(pointerValue) as Partial<typeof pointer>;
        if (
          typeof candidatePointer.reference !== "string" ||
          !candidatePointer.reference ||
          typeof candidatePointer.clientRequestId !== "string" ||
          !candidatePointer.clientRequestId
        ) {
          sessionStorage.removeItem("dinktopia:active-hold");
          return;
        }
        pointer = {
          reference: candidatePointer.reference,
          clientRequestId: candidatePointer.clientRequestId,
        };

        const storedValue = sessionStorage.getItem(
          `dinktopia:booking:${pointer.reference}`,
        );
        if (!storedValue) {
          sessionStorage.removeItem("dinktopia:active-hold");
          return;
        }
        const candidateStored = JSON.parse(storedValue) as {
          record?: unknown;
          token?: unknown;
        };
        if (
          !isStoredBookingRecord(candidateStored.record) ||
          candidateStored.record.reference !== pointer.reference ||
          typeof candidateStored.token !== "string" ||
          !candidateStored.token
        ) {
          sessionStorage.removeItem("dinktopia:active-hold");
          return;
        }
        parsed = {
          record: candidateStored.record,
          token: candidateStored.token,
        };
      } catch {
        try {
          sessionStorage.removeItem("dinktopia:active-hold");
        } catch {
          // Storage can be unavailable in hardened browser modes.
        }
        return;
      }

      let current: Awaited<ReturnType<typeof bookingStatus>>;
      try {
        current = await bookingStatus(pointer.reference, parsed.token);
      } catch {
        // Fail closed: never reveal payment controls for an unverified saved hold.
        return;
      }
      if (!active) return;

      const currentBooking = current.booking as
        | { status?: string; expiresAt?: string | null; expires_at?: string | null }
        | undefined;
      const restoredExpiry =
        currentBooking?.expiresAt ??
        currentBooking?.expires_at ??
        parsed.record.expiresAt ??
        null;
      const mappedStatus = mappedBookingStatus(
        currentBooking?.status,
        parsed.record.status,
      );
      const validatedRestoredExpiry =
        restoredExpiry && Number.isFinite(Date.parse(restoredExpiry))
          ? restoredExpiry
          : null;
      const livePendingExpiryInvalid =
        platformMode() === "live" &&
        mappedStatus === "pending_payment" &&
        !validatedRestoredExpiry;
      const restored: BookingRecord = {
        ...parsed.record,
        status: livePendingExpiryInvalid ? "cancelled" : mappedStatus,
        expiresAt: validatedRestoredExpiry,
      };
      try {
        sessionStorage.setItem(
          `dinktopia:booking:${restored.reference}`,
          JSON.stringify({ ...parsed, record: restored }),
        );
      } catch {
        // Fail closed when the verified state cannot be persisted for recovery.
        return;
      }

      bookingAttemptIdRef.current = pointer.clientRequestId;
      setSelectedDate(restored.date);
      setSelectedCourtId(restored.courtId);
      setDuration(restored.durationHours);
      setCustomer(restored.customer);
      setAcceptedPolicy(true);
      setPaymentError("");
      setMode("book");
      setHoldNow(Date.now());

      if (restored.status === "confirmed" || restored.status === "payment_review") {
        try {
          sessionStorage.removeItem("dinktopia:active-hold");
          sessionStorage.removeItem(`dinktopia:pending:${pointer.clientRequestId}`);
        } catch {
          // The authoritative status is still safe to show without payment controls.
        }
        setPendingBooking(null);
        setConfirmedBooking(restored);
        setStep(5);
        setLiveMessage(
          restored.status === "confirmed"
            ? `Booking ${restored.reference} is confirmed.`
            : `Payment for booking ${restored.reference} is under review.`,
        );
        return;
      }

      setConfirmedBooking(null);
      setPendingBooking(restored);
      setStep(4);
      setLiveMessage(
        restored.status === "pending_payment"
          ? `Saved hold ${restored.reference} was verified and restored.`
          : `Saved hold ${restored.reference} is no longer available.`,
      );
    };

    void restoreActiveHold();
    return () => {
      active = false;
    };
  }, [adapter]);

  useEffect(() => {
    if (!pendingBooking?.expiresAt) return;
    const intervalId = window.setInterval(() => setHoldNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [pendingBooking?.expiresAt]);

  useEffect(() => {
    if (!isLive || step !== 4 || pendingBooking || !securitySiteKey || !turnstileContainerRef.current) return;
    let disposed = false;
    const container = turnstileContainerRef.current;
    const renderWidget = () => {
      if (disposed || !window.turnstile || turnstileWidgetRef.current) return;
      turnstileWidgetRef.current = window.turnstile.render(container, {
        sitekey: securitySiteKey,
        theme: "light",
        callback: (token) => setTurnstileTokenValue(token),
        "expired-callback": () => setTurnstileTokenValue(""),
        "error-callback": () => setTurnstileTokenValue(""),
      });
    };
    const scriptId = "dinktopia-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);
    }

    return () => {
      disposed = true;
      script?.removeEventListener("load", renderWidget);
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetRef.current);
        turnstileWidgetRef.current = null;
      }
      setTurnstileTokenValue("");
    };
  }, [isLive, pendingBooking, securitySiteKey, step]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAvailabilityState("loading");
      setSelectedSlot(null);
    });
    if (isLive && bootstrapState !== "ready") {
      queueMicrotask(() => {
        if (active) setSlots([]);
      });
      return () => {
        active = false;
      };
    }

    adapter
      .getAvailability({
        tenantSlug: "dinktopia",
        date: selectedDate,
        courtId: selectedCourtId,
        durationHours: duration,
      })
      .then((nextSlots) => {
        if (!active) return;
        setSlots(nextSlots);
        setAvailabilityState("ready");
      })
      .catch(() => {
        if (!active) return;
        setSlots([]);
        setAvailabilityState("error");
      });

    return () => {
      active = false;
    };
  }, [adapter, availabilityRetry, bootstrapState, duration, isLive, selectedCourtId, selectedDate]);

  useEffect(() => {
    if (!pendingBooking) bookingAttemptIdRef.current = "";
  }, [duration, pendingBooking, selectedCourtId, selectedDate, selectedSlot?.hour]);

  function scrollToBooking() {
    window.setTimeout(
      () => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function openBooking(courtId?: string) {
    if (courtId) chooseCourt(courtId);
    setMode("book");
    setMobileNavOpen(false);
    scrollToBooking();
  }

  function openManage() {
    setMode("manage");
    setMobileNavOpen(false);
    scrollToBooking();
  }

  function chooseCourt(courtId: string) {
    setSelectedCourtId(courtId);
    const publicCourt = bootstrap?.courts.find((court) => court.id === courtId);
    const pricing = publicCourt?.pricingConfig as
      | { regular?: { minimumHours?: number; maximumHours?: number } }
      | undefined;
    const minimum = pricing?.regular?.minimumHours ?? activeTenant.booking.minimumHours;
    const maximum = pricing?.regular?.maximumHours ?? activeTenant.booking.maximumHours;
    setDuration((current) => Math.min(maximum, Math.max(minimum, current)));
  }

  function chooseSlot(slot: AvailabilitySlot) {
    if (slot.status === "unavailable") return;
    setSelectedSlot(slot);
    setLiveMessage(
      `${slot.startsAt} to ${slot.endsAt} selected on ${selectedCourt.name}.`,
    );
  }

  function validateDetails() {
    const errors: Partial<Record<keyof CustomerDetails, string>> = {};
    if (customer.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(customer.email)) errors.email = "Enter a valid email address.";
    if (!/^(\+?63|0)[\d\s-]{9,}$/.test(customer.phone)) {
      errors.phone = "Enter a valid Philippine mobile number.";
    }
    setDetailErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validateDetails()) setStep(3);
  }

  async function reservePaymentHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    if (bootstrapState === "error") {
      setPaymentError("Booking setup could not be loaded. Refresh the page before trying again.");
      return;
    }
    if (isLive && !bootstrap?.readiness.publicBookingEnabled) {
      setPaymentError("Online booking is not active for this venue yet.");
      return;
    }
    if (isLive && !paymentMethod) {
      setPaymentError("A live payment method has not been published yet.");
      return;
    }
    if (isLive && !policyVersion) {
      setPaymentError("The current booking policy has not been published yet.");
      return;
    }
    if (isLive && (!securitySiteKey || !turnstileTokenValue)) {
      setPaymentError("Complete the security check before submitting your booking.");
      return;
    }
    if (!selectedSlot) {
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const clientRequestId = bookingAttemptIdRef.current || crypto.randomUUID();
      bookingAttemptIdRef.current = clientRequestId;
      const booking = await adapter.createHold({
        tenantSlug: "dinktopia",
        date: selectedDate,
        courtId: selectedCourtId,
        startHour: selectedSlot.hour,
        durationHours: duration,
        amount: total,
        customer,
        policyVersion: isLive ? policyVersion : "dinktopia-provisional-v1",
        turnstileToken: turnstileTokenValue || undefined,
        clientRequestId,
      });
      setPendingBooking(booking);
      setHoldNow(Date.now());
      setLiveMessage(
        isLive
          ? `Booking ${booking.reference} is held while payment is submitted.`
          : `Preview hold ${booking.reference} was created. No real court is reserved.`,
      );
    } catch (error) {
      if (isLive) {
        setTurnstileTokenValue("");
        if (turnstileWidgetRef.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetRef.current);
        }
      }
      setPaymentError(
        error instanceof Error
          ? error.message
          : "The slot could not be reserved. Refresh availability and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    if (!pendingBooking) {
      setPaymentError("Reserve the slot before sending payment.");
      return;
    }
    if (holdExpired) {
      setPaymentError("This hold has expired or been released. Choose a new time.");
      return;
    }
    if (!heldPaymentReady) {
      setPaymentError(
        "Live payment setup is unavailable. Payment remains disabled; cancel this hold or try again before it expires.",
      );
      return;
    }
    if (paymentReference.trim().length < 6) {
      setPaymentError(
        isLive
          ? `Enter the reference number from your ${paymentLabel} receipt.`
          : "Enter a sample reference number to continue the preview. Do not send money.",
      );
      return;
    }
    if (!receiptFileName || !receiptFile) {
      setPaymentError(
        isLive
          ? "Upload a JPG, PNG, or WebP copy of your payment receipt."
          : "Choose a sample JPG, PNG, or WebP image. No real receipt or payment is required.",
      );
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(receiptFile.type) ||
      receiptFile.size > 2 * 1024 * 1024
    ) {
      setPaymentError("Choose a JPG, PNG, or WebP receipt no larger than 2 MB.");
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await adapter.submitPayment({
        booking: pendingBooking,
        paymentReference: paymentReference.trim(),
        receiptFileName,
        receiptFile,
        paymentMethod: paymentMethodCode,
        clientRequestId: bookingAttemptIdRef.current,
      });
      setConfirmedBooking(booking);
      setPendingBooking(null);
      setStep(5);
      setLiveMessage(
        !isLive
          ? `Preview checkout ${booking.reference} is complete. No payment was sent.`
          : booking.status === "confirmed"
            ? `Booking ${booking.reference} is confirmed.`
            : `Payment for booking ${booking.reference} has been received for review.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : isLive
            ? "Payment could not be submitted. Your slot has not been charged."
            : "The preview could not be completed. No reservation or payment was created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearHoldForReselection(message: string) {
    try {
      sessionStorage.removeItem("dinktopia:active-hold");
      if (bookingAttemptIdRef.current) {
        sessionStorage.removeItem(
          `dinktopia:pending:${bookingAttemptIdRef.current}`,
        );
      }
    } catch {
      // The UI can still recover when browser storage is unavailable.
    }
    setPendingBooking(null);
    setConfirmedBooking(null);
    setSelectedSlot(null);
    setPaymentReference("");
    setReceiptFileName("");
    setReceiptFile(null);
    setPaymentError("");
    setAcceptedPolicy(false);
    setTurnstileTokenValue("");
    bookingAttemptIdRef.current = "";
    setStep(1);
    setLiveMessage(message);
    scrollToBooking();
  }

  async function cancelCurrentHold() {
    if (!pendingBooking) return;
    if (holdExpired) {
      setIsSubmitting(true);
      if (pendingBooking.status === "pending_payment") {
        try {
          await adapter.cancelBooking(
            pendingBooking.reference,
            "hold-expired-customer-reselected",
          );
        } catch {
          // Expiry remains authoritative even when the best-effort release fails.
        }
      }
      clearHoldForReselection(
        "The unavailable hold was cleared. Choose a new time.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setPaymentError("");
    try {
      const cancelled = await adapter.cancelBooking(
        pendingBooking.reference,
        "customer-reselected",
      );
      clearHoldForReselection(
        isLive
          ? `Booking ${cancelled.reference} was cancelled and the court was released.`
          : `Preview hold ${cancelled.reference} was cleared. No real court was reserved.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "The hold could not be cancelled. Try again before choosing another time.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetBooking() {
    setStep(1);
    setSelectedSlot(null);
    setPaymentReference("");
    setReceiptFileName("");
    setReceiptFile(null);
    setPaymentError("");
    setPendingBooking(null);
    setConfirmedBooking(null);
    setAcceptedPolicy(false);
    setTurnstileTokenValue("");
    bookingAttemptIdRef.current = "";
    scrollToBooking();
  }

  async function lookupBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupReference.trim() || !/^\S+@\S+\.\S+$/.test(lookupEmail)) {
      setLookupState("error");
      return;
    }

    setLookupState("loading");
    setManagedBooking(null);
    setShowCancel(false);
    setShowRescheduleHelp(false);
    setCancelState("idle");
    try {
      const result = await adapter.findBooking(lookupReference, lookupEmail);
      setManagedBooking(result);
      setLookupState(result ? "found" : "empty");
    } catch {
      setLookupState("error");
    }
  }

  async function confirmCancel() {
    if (!managedBooking || managedBooking.status !== "pending_payment" || !cancelReason) return;
    setCancelState("loading");
    try {
      const cancelled = await adapter.cancelBooking(managedBooking.reference, cancelReason);
      setManagedBooking(cancelled);
      setCancelState("success");
      setShowCancel(false);
      setLiveMessage(`Booking ${cancelled.reference} has been cancelled.`);
    } catch {
      setCancelState("error");
    }
  }

  const stepLabels = ["Choose", "Details", "Review", "Pay"];

  return (
    <div className="dinktopia-site">
      {!isLive && (
        <div className="preview-ribbon" role="status">
          <strong>Setup preview</strong><span>No live reservations or payments are created.</span>
        </div>
      )}
      <header className={`site-header ${!isLive ? "has-preview-ribbon" : ""}`}>
        <div className="site-container header-inner">
          <a className="wordmark" href="#top" aria-label="Dinktopia home">
            <Image
              className="brand-logo"
              src="/dinktopia-logo.png"
              alt=""
              width={2046}
              height={769}
              sizes="(max-width: 390px) 138px, (max-width: 779px) 142px, (max-width: 1179px) 176px, 180px"
              priority
            />
          </a>
          <button
            className="menu-button"
            type="button"
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span className="menu-lines" aria-hidden="true" />
            <span>{mobileNavOpen ? "Close" : "Menu"}</span>
          </button>
          <nav
            id="primary-navigation"
            className={`primary-nav ${mobileNavOpen ? "is-open" : ""}`}
            aria-label="Primary navigation"
          >
            <a href="#courts" onClick={() => setMobileNavOpen(false)}>
              Courts
            </a>
            <a href="#how-it-works" onClick={() => setMobileNavOpen(false)}>
              How it works
            </a>
            <button className="nav-text-button" type="button" onClick={openManage}>
              Manage booking
            </button>
            <button className="button button-small button-lime" type="button" onClick={() => openBooking()}>
              Book a court <span aria-hidden="true">↗</span>
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero-grid site-container">
            <div className="hero-copy">
              <p className="eyebrow"><span aria-hidden="true">●</span> Dinktopia Pickleball Club</p>
              <h1>
                Your next rally
                <span>starts here.</span>
              </h1>
              <p className="hero-lede">
                Good games should be easy to find. Pick your court, lock in an hour,
                and meet your crew on the bright side of the net.
              </p>
              <div className="hero-actions">
                <button className="button button-lime button-large" type="button" onClick={() => openBooking()}>
                  Find a court <span aria-hidden="true">→</span>
                </button>
                <a className="text-link" href="#courts">
                  Meet the courts <span aria-hidden="true">↓</span>
                </a>
              </div>
              <ul className="hero-proof" aria-label="Booking highlights">
                <li><strong>{displayCourts.length}</strong><span>{isLive ? "bookable courts" : "preview courts"}</span></li>
                <li><strong>6–10</strong><span>daily play hours</span></li>
                <li><strong>60 min</strong><span>minimum notice</span></li>
              </ul>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="court-art" aria-hidden="true">
                <div className="court-net" />
                <div className="court-service-line court-service-line-one" />
                <div className="court-service-line court-service-line-two" />
                <div className="court-center-line court-center-line-one" />
                <div className="court-center-line court-center-line-two" />
                <div className="court-player court-player-one" />
                <div className="court-player court-player-two" />
                <div className="court-ball" />
                <span className="court-label court-label-one">DINK</span>
                <span className="court-label court-label-two">TOPIA</span>
              </div>
              <div className="score-card">
                <div><span>COURT</span><strong>01</strong></div>
                <div><span>NEXT OPEN</span><strong>07:00</strong></div>
                <span className="score-live"><i aria-hidden="true" /> LIVE</span>
              </div>
              <div className="floating-note">
                <span className="floating-note-icon" aria-hidden="true">↗</span>
                <p><strong>One tap closer</strong><br />to your next game</p>
              </div>
            </div>
          </div>
          <div className={`ticker ${tickerPaused ? "is-paused" : ""}`}>
            <div className="ticker-window" aria-hidden="true">
              <div className="ticker-track">
                <div className="ticker-sequence">
                  <span>PLAY MORE</span><i>◆</i><span>RALLY OFTEN</span><i>◆</i>
                  <span>STAY CURIOUS</span><i>◆</i><span>PLAY MORE</span><i>◆</i>
                  <span>RALLY OFTEN</span><i>◆</i><span>STAY CURIOUS</span><i>◆</i>
                </div>
                <div className="ticker-sequence ticker-sequence-copy">
                  <span>PLAY MORE</span><i>◆</i><span>RALLY OFTEN</span><i>◆</i>
                  <span>STAY CURIOUS</span><i>◆</i><span>PLAY MORE</span><i>◆</i>
                  <span>RALLY OFTEN</span><i>◆</i><span>STAY CURIOUS</span><i>◆</i>
                </div>
              </div>
            </div>
            <button
              className="ticker-toggle"
              type="button"
              aria-label="Pause moving phrase banner"
              aria-pressed={tickerPaused}
              onClick={() => setTickerPaused((paused) => !paused)}
            >
              <span aria-hidden="true">{tickerPaused ? "▶" : "Ⅱ"}</span>
            </button>
          </div>
        </section>

        <section className="court-discovery section-pad" id="courts">
          <div className="site-container">
            <div className="section-heading">
              <div>
                <p className="eyebrow eyebrow-dark">Pick your playground</p>
                <h2>Same game.<br />Different energy.</h2>
              </div>
              <p>
                {isLive ? `${displayCourts.length} configured courts` : "Two dedicated preview courts"}, designed for quick games,
                long rallies, and the happy blur in between.
              </p>
            </div>
            <div className="court-card-grid">
              {displayCourts.map((court) => (
                <article className={`court-card court-card-${court.color}`} key={court.id}>
                  <div className="court-card-topline">
                    <span>COURT {court.number}</span>
                    <span className="court-status"><i aria-hidden="true" /> Booking preview</span>
                  </div>
                  <div className="mini-court" aria-hidden="true">
                    <span className="mini-court-number">{court.number}</span>
                    <i className="mini-court-line-one" />
                    <i className="mini-court-line-two" />
                    <i className="mini-court-net" />
                  </div>
                  <div className="court-card-copy">
                    <p>{court.descriptor}</p>
                    <h3>{court.name}</h3>
                    <div className="court-card-meta">
                      <span>{court.mood}</span>
                      <span>From ₱300 / hour</span>
                    </div>
                    <button className="button court-button" type="button" onClick={() => openBooking(court.id)}>
                      Check Court {court.number} times <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="how-section section-pad" id="how-it-works">
          <div className="site-container how-grid">
            <div className="how-intro">
              <p className="eyebrow">No back-and-forth</p>
              <h2>From “game?” to booked.</h2>
              <p>Everything you need, nothing that slows down the rally.</p>
            </div>
            <ol className="how-list">
              <li><span>01</span><div><h3>Choose your hour</h3><p>See real-time availability for both courts.</p></div></li>
              <li><span>02</span><div><h3>Bring your crew</h3><p>Book one to three whole hours, up to 30 days ahead.</p></div></li>
              <li><span>03</span><div><h3>Pay, then play</h3><p>Send your GCash receipt and get a booking reference.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="booking-zone section-pad" id="book" ref={bookingSectionRef}>
          <div className="site-container">
            <div className="booking-zone-heading">
              <div>
                <p className="eyebrow eyebrow-dark">Make your move</p>
                <h2>{mode === "book" ? "Book a court" : "Manage your booking"}</h2>
              </div>
              <div className="mode-switch" role="group" aria-label="Booking actions">
                <button
                  type="button"
                  className={mode === "book" ? "is-active" : ""}
                  aria-pressed={mode === "book"}
                  onClick={() => setMode("book")}
                >
                  New booking
                </button>
                <button
                  type="button"
                  className={mode === "manage" ? "is-active" : ""}
                  aria-pressed={mode === "manage"}
                  onClick={() => setMode("manage")}
                >
                  Manage
                </button>
              </div>
            </div>

            {mode === "book" && isLive && !liveBookingReady ? (
              <div className="setup-unavailable-card" role={bootstrapState === "loading" ? "status" : "alert"}>
                <span className={bootstrapState === "loading" ? "spinner" : "setup-unavailable-symbol"} aria-hidden="true">{bootstrapState === "loading" ? "" : "!"}</span>
                <div>
                  <p className="eyebrow eyebrow-dark">{bootstrapState === "loading" ? "Checking venue setup" : "Online booking unavailable"}</p>
                  <h3>{bootstrapState === "loading" ? "Loading the court board…" : "The clubhouse is still getting ready."}</h3>
                  <p>{bootstrapState === "loading" ? "We’re confirming courts, policies, payment, and security." : "No payment instructions are shown until the venue, published policy, payment method, and security check are all active."}</p>
                </div>
                {bootstrapState !== "loading" && <a className="button button-outline" href="#courts">Explore the preview courts</a>}
              </div>
            ) : mode === "book" ? (
              <div className="booking-shell">
                {step < 5 && (
                  <ol className="booking-progress" aria-label="Booking progress">
                    {stepLabels.map((label, index) => {
                      const number = index + 1;
                      const state = number === step ? "current" : number < step ? "complete" : "upcoming";
                      return (
                        <li key={label} className={`is-${state}`} aria-current={number === step ? "step" : undefined}>
                          <span>{number < step ? "✓" : String(number).padStart(2, "0")}</span>
                          <small>{label}</small>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {step === 1 && (
                  <div className="booking-layout">
                    <div className="booking-main-card">
                      <div className="booking-card-heading">
                        <span className="step-chip">STEP 01</span>
                        <div><h3>When are you playing?</h3><p>Times shown in Philippine Standard Time.</p></div>
                      </div>

                      <fieldset className="booking-fieldset">
                        <legend>Choose a date</legend>
                        <div className="date-rail">
                          {dates.map((date) => (
                            <button
                              type="button"
                              key={date.iso}
                              className={`date-option ${selectedDate === date.iso ? "is-selected" : ""}`}
                              aria-pressed={selectedDate === date.iso}
                              onClick={() => setSelectedDate(date.iso)}
                            >
                              <span>{date.isToday ? "Today" : date.day}</span>
                              <strong>{date.date}</strong>
                              <small>{date.month}</small>
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <div className="choice-row">
                        <fieldset className="booking-fieldset">
                          <legend>Choose a court</legend>
                          <div className="court-choice-list">
                            {displayCourts.map((court) => (
                              <label key={court.id} className={`court-choice ${selectedCourtId === court.id ? "is-selected" : ""}`}>
                                <input
                                  type="radio"
                                  name="court"
                                  value={court.id}
                                  checked={selectedCourtId === court.id}
                                  onChange={() => chooseCourt(court.id)}
                                />
                                <span className="court-choice-number">{court.number}</span>
                                <span><strong>{court.name}</strong><small>{court.descriptor}</small></span>
                                <i aria-hidden="true" />
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="booking-fieldset duration-fieldset">
                          <legend>How long?</legend>
                          <div className="duration-control">
                            {durationOptions.map((hours) => (
                              <button
                                type="button"
                                key={hours}
                                className={duration === hours ? "is-selected" : ""}
                                aria-pressed={duration === hours}
                                onClick={() => setDuration(hours)}
                              >
                                <strong>{hours}</strong><span>{hours === 1 ? "hour" : "hours"}</span>
                              </button>
                            ))}
                          </div>
                          <p className="field-hint">Whole-hour bookings only</p>
                        </fieldset>
                      </div>

                      <fieldset className="booking-fieldset availability-fieldset">
                        <div className="availability-legend-row">
                          <legend>Pick a start time</legend>
                          <div className="slot-legend" aria-label="Availability key">
                            <span><i className="legend-open" />Open</span>
                            <span><i className="legend-limited" />Popular</span>
                            <span><i className="legend-booked" />Booked</span>
                          </div>
                        </div>

                        {availabilityState === "loading" && (
                          <div className="availability-loading" role="status" aria-live="polite">
                            <span className="spinner" aria-hidden="true" />
                            <div><strong>Checking the court board…</strong><small>Looking for open whole-hour slots.</small></div>
                          </div>
                        )}

                        {availabilityState === "error" && (
                          <div className="state-card state-error" role="alert">
                            <span className="state-symbol" aria-hidden="true">!</span>
                            <div><h4>The schedule took a timeout.</h4><p>Your choices are still here. Try loading availability again.</p></div>
                            <button className="button button-outline" type="button" onClick={() => setAvailabilityRetry((value) => value + 1)}>Try again</button>
                          </div>
                        )}

                        {availabilityState === "ready" && availableCount === 0 && (
                          <div className="state-card state-empty" role="status">
                            <span className="state-symbol" aria-hidden="true">0</span>
                            <div><h4>This day is rally-packed.</h4><p>No {duration}-hour starts are open. Try the next date or another court.</p></div>
                            <button
                              className="button button-outline"
                              type="button"
                              onClick={() => {
                                const currentIndex = dates.findIndex((date) => date.iso === selectedDate);
                                setSelectedDate(dates[Math.min(currentIndex + 1, dates.length - 1)].iso);
                              }}
                            >
                              Check next day
                            </button>
                          </div>
                        )}

                        {availabilityState === "ready" && availableCount > 0 && (
                          <div className="time-groups">
                            {[
                              { label: "Morning", range: [6, 12] },
                              { label: "Afternoon", range: [12, 16] },
                              { label: "Evening", range: [16, 22] },
                            ].map((group) => {
                              const groupSlots = slots.filter((slot) => slot.hour >= group.range[0] && slot.hour < group.range[1]);
                              if (!groupSlots.length) return null;
                              return (
                                <div className="time-group" key={group.label}>
                                  <div className="time-group-label"><span>{group.label}</span><i /></div>
                                  <div className="slot-grid">
                                    {groupSlots.map((slot) => (
                                      <button
                                        type="button"
                                        key={slot.hour}
                                        disabled={slot.status === "unavailable"}
                                        className={`time-slot is-${slot.status} ${selectedSlot?.hour === slot.hour ? "is-selected" : ""}`}
                                        aria-pressed={selectedSlot?.hour === slot.hour}
                                        aria-label={
                                          slot.status === "unavailable"
                                            ? `${slot.startsAt}, unavailable`
                                            : `${slot.startsAt} to ${slot.endsAt}, ${peso(slot.price)}${slot.status === "limited" ? ", popular time" : ""}`
                                        }
                                        onClick={() => chooseSlot(slot)}
                                      >
                                        <span className="slot-dot" aria-hidden="true" />
                                        <strong>{slot.startsAt.replace(":00", "")}</strong>
                                        <small>{slot.status === "unavailable" ? "Booked" : peso(slot.price)}</small>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </fieldset>

                      <div className="booking-mobile-action">
                        <div>{selectedSlot ? <><small>Total</small><strong>{peso(total)}</strong></> : <span>Choose an open time</span>}</div>
                        <button data-testid="booking-continue" className="button button-blue" type="button" disabled={!selectedSlot} onClick={() => setStep(2)}>Continue <span aria-hidden="true">→</span></button>
                      </div>
                    </div>
                    <BookingSummary
                      court={selectedCourt}
                      dateLabel={selectedDateDetails?.long ?? selectedDate}
                      duration={duration}
                      slot={selectedSlot}
                      subtotal={courtSubtotal}
                      bookingFee={bookingFee ?? 0}
                      total={total}
                      actionLabel="Continue"
                      actionDisabled={!selectedSlot}
                      onAction={() => setStep(2)}
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="booking-layout compact-step">
                    <form className="booking-main-card" onSubmit={submitDetails} noValidate>
                      <div className="booking-card-heading">
                        <span className="step-chip">STEP 02</span>
                        <div><h3>Who&apos;s rallying?</h3><p>We&apos;ll send booking updates to these details.</p></div>
                      </div>
                      <div className="guest-note"><span aria-hidden="true">◎</span><div><strong>No account needed</strong><p>Book as a guest. Your reference and email are all you need later.</p></div></div>
                      <div className="form-grid">
                        <div className="form-field form-field-wide">
                          <label htmlFor={`${formId}-name`}>Full name</label>
                          <input
                            id={`${formId}-name`}
                            autoComplete="name"
                            value={customer.fullName}
                            aria-invalid={Boolean(detailErrors.fullName)}
                            aria-describedby={detailErrors.fullName ? fieldErrorId(formId, "name") : undefined}
                            onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })}
                            placeholder="Juan Dela Cruz"
                          />
                          {detailErrors.fullName && <span className="field-error" id={fieldErrorId(formId, "name")}>{detailErrors.fullName}</span>}
                        </div>
                        <div className="form-field">
                          <label htmlFor={`${formId}-email`}>Email address</label>
                          <input
                            id={`${formId}-email`}
                            type="email"
                            autoComplete="email"
                            value={customer.email}
                            aria-invalid={Boolean(detailErrors.email)}
                            aria-describedby={detailErrors.email ? fieldErrorId(formId, "email") : undefined}
                            onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
                            placeholder="juan@example.com"
                          />
                          {detailErrors.email && <span className="field-error" id={fieldErrorId(formId, "email")}>{detailErrors.email}</span>}
                        </div>
                        <div className="form-field">
                          <label htmlFor={`${formId}-phone`}>Mobile number</label>
                          <input
                            id={`${formId}-phone`}
                            type="tel"
                            autoComplete="tel"
                            value={customer.phone}
                            aria-invalid={Boolean(detailErrors.phone)}
                            aria-describedby={detailErrors.phone ? fieldErrorId(formId, "phone") : undefined}
                            onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                            placeholder="0917 123 4567"
                          />
                          {detailErrors.phone && <span className="field-error" id={fieldErrorId(formId, "phone")}>{detailErrors.phone}</span>}
                        </div>
                      </div>
                      <label className="check-row">
                        <input type="checkbox" checked={customer.updates} onChange={(event) => setCustomer({ ...customer, updates: event.target.checked })} />
                        <span><strong>Send me practical booking updates</strong><small>Receipts, court changes, and reminders only.</small></span>
                      </label>
                      <div className="step-actions">
                        <button className="button button-ghost" type="button" onClick={() => setStep(1)}><span aria-hidden="true">←</span> Back</button>
                        <button data-testid="details-submit" className="button button-blue" type="submit">Review booking <span aria-hidden="true">→</span></button>
                      </div>
                    </form>
                    <BookingSummary court={selectedCourt} dateLabel={selectedDateDetails?.long ?? selectedDate} duration={duration} slot={selectedSlot} subtotal={courtSubtotal} bookingFee={bookingFee ?? 0} total={total} />
                  </div>
                )}

                {step === 3 && selectedSlot && (
                  <div className="booking-layout compact-step">
                    <div className="booking-main-card">
                      <div className="booking-card-heading">
                        <span className="step-chip">STEP 03</span>
                        <div><h3>One last look</h3><p>{isLive ? "Check the details before heading to payment." : "Check the details before previewing checkout. No real reservation or payment will be created."}</p></div>
                      </div>
                      <div className="review-board">
                        <div className="review-court-mark"><span>COURT</span><strong>{selectedCourt.number}</strong><small>{selectedCourt.name}</small></div>
                        <dl>
                          <div><dt>Date</dt><dd>{selectedDateDetails?.long}</dd></div>
                          <div><dt>Time</dt><dd>{selectedSlot.startsAt}–{selectedSlot.endsAt}</dd></div>
                          <div><dt>Duration</dt><dd>{duration} {duration === 1 ? "hour" : "hours"}</dd></div>
                          <div><dt>Booked by</dt><dd>{customer.fullName}<small>{customer.email} · {customer.phone}</small></dd></div>
                        </dl>
                        <button className="edit-details-button" type="button" onClick={() => setStep(2)}>Edit details</button>
                      </div>
                      <div className="policy-grid">
                        <div><span aria-hidden="true">↺</span><h4>{policyTitle}</h4><p>{policyIntro}</p></div>
                        <div><span aria-hidden="true">◷</span><h4>Rescheduling</h4><p>{policyContent}</p></div>
                      </div>
                      {isLive && !policyVersion && (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>Policy setup is incomplete</strong><p>New bookings stay unavailable until the venue publishes its current booking policy.</p></div>
                        </div>
                      )}
                      <label className={`check-row policy-check ${!acceptedPolicy ? "needs-check" : ""}`}>
                        <input type="checkbox" checked={acceptedPolicy} disabled={isLive && !policyVersion} onChange={(event) => setAcceptedPolicy(event.target.checked)} />
                        <span><strong>I agree to the booking and cancellation rules</strong><small>{isLive ? "Full payment is required for confirmation." : "Preview only—no real reservation or payment will be created."}</small></span>
                      </label>
                      <div className="step-actions">
                        <button className="button button-ghost" type="button" onClick={() => setStep(2)}><span aria-hidden="true">←</span> Back</button>
                        <button data-testid="review-to-payment" className="button button-blue" type="button" disabled={!acceptedPolicy} onClick={() => setStep(4)}>{isLive ? "Continue to payment" : "Preview checkout"} <span aria-hidden="true">→</span></button>
                      </div>
                    </div>
                    <BookingSummary court={selectedCourt} dateLabel={selectedDateDetails?.long ?? selectedDate} duration={duration} slot={selectedSlot} subtotal={courtSubtotal} bookingFee={bookingFee ?? 0} total={total} />
                  </div>
                )}

                {step === 4 && checkoutSlot && (
                  <div className="booking-layout compact-step">
                    <form className="booking-main-card" onSubmit={pendingBooking ? submitPayment : reservePaymentHold} noValidate>
                      <div className="booking-card-heading">
                        <span className="step-chip">STEP 04</span>
                        <div>
                          <h3>{pendingBooking ? holdExpired ? "Hold unavailable" : !heldPaymentReady ? "Payment temporarily unavailable" : isLive ? `Pay with ${paymentLabel}` : "Preview only—do not pay" : isLive ? "Reserve before you pay" : "Preview the reserve-first flow"}</h3>
                          <p>{pendingBooking ? holdExpired ? "Payment is disabled because this hold expired or was released." : !heldPaymentReady ? "The hold was verified, but live payment setup is not currently available." : isLive ? "Upload your receipt so the club can verify your payment." : "This checkout is a simulation. No real reservation or payment will be created." : isLive ? "We will atomically hold this exact court and total before showing payment details." : "Create a simulated hold to inspect checkout without reserving a court or sending money."}</p>
                        </div>
                      </div>
                      {pendingBooking && (
                        <>
                          <div className={`notice-banner ${holdExpired ? "" : "notice-success"}`} role={holdExpired ? "alert" : undefined}>
                            <div>
                              <strong>{holdExpired ? "Hold expired or released" : isLive ? `Slot held · ${pendingBooking.reference}` : `Preview hold only · ${pendingBooking.reference}`}</strong>
                              <span>
                                {holdExpired
                                  ? "Payment is disabled. Clear this hold and choose an available time."
                                  : isLive
                                    ? !heldPaymentReady
                                      ? `${holdRemainingSeconds == null ? "The server controls this hold window." : `Hold expires in ${formatHoldCountdown(holdRemainingSeconds)}.`} Payment controls remain disabled until live setup is verified.`
                                      : `${holdRemainingSeconds == null ? "The server controls this hold window." : `Hold expires in ${formatHoldCountdown(holdRemainingSeconds)}.`} Send payment only while this verified hold is active.`
                                    : "No real court is reserved. Do not send money."}
                              </span>
                            </div>
                          </div>
                          {!holdExpired && heldPaymentReady && (
                            <>
                              <div className="payment-panel">
                                {paymentQrUrl ? (
                                  <div className="payment-qr payment-qr-live">
                                    {/* The URL is tenant-owned public payment configuration. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={paymentQrUrl} alt={`${paymentLabel} payment QR code`} />
                                  </div>
                                ) : (
                                  <div className="payment-qr" aria-label={`${paymentLabel} QR code placeholder pending venue setup`}>
                                    <div className="qr-pattern" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                                    <span>{paymentLabel.toUpperCase()}</span>
                                  </div>
                                )}
                                <div className="payment-instructions">
                                  <span className="setup-badge">{isLive ? "SECURE PAYMENT" : "PAYMENT PREVIEW—DO NOT PAY"}</span>
                                  <h4>{isLive ? <>Send exactly <strong>{peso(pendingBooking.amount)}</strong></> : <>Preview total <strong>{peso(pendingBooking.amount)}</strong> — do not pay</>}</h4>
                                  <p>{isLive ? paymentMethod?.instructions ?? "The live QR and account name will appear here when the clubhouse payment profile is activated." : "This panel demonstrates the receipt workflow only. It does not reserve a court or transfer money."}</p>
                                  {isLive && paymentMethod?.accountName && <p className="payment-account"><strong>Account:</strong> {paymentMethod.accountName}{paymentMethod.accountReference ? ` · ${paymentMethod.accountReference}` : paymentMethod.accountNumber ? ` · ${paymentMethod.accountNumber}` : ""}</p>}
                                  {isLive ? (
                                    <ol><li>Open {paymentLabel} and scan the club QR.</li><li>Send the exact held total.</li><li>Save your receipt and add it below.</li></ol>
                                  ) : (
                                    <ol><li>Do not send money or scan a payment code.</li><li>Use sample details only to preview validation.</li><li>No real reservation or payment is created.</li></ol>
                                  )}
                                </div>
                              </div>
                              <div className="form-grid payment-fields">
                                <div className="form-field">
                                  <label htmlFor={`${formId}-payment-reference`}>{isLive ? paymentLabel : "Sample payment"} reference number</label>
                                  <input id={`${formId}-payment-reference`} inputMode="numeric" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="e.g. 1234 5678 9012" />
                                </div>
                                <div className="form-field">
                                  <label htmlFor={`${formId}-receipt`}>{isLive ? "Payment receipt" : "Sample receipt image"}</label>
                                  <label className={`upload-control ${receiptFileName ? "has-file" : ""}`} htmlFor={`${formId}-receipt`}>
                                    <span aria-hidden="true">＋</span>
                                    <span><strong>{receiptFileName || "Choose a file"}</strong><small>{receiptFileName ? "Ready to submit" : "JPG, PNG, or WebP · max 2 MB"}</small></span>
                                  </label>
                                  <input
                                    className="visually-hidden-file"
                                    id={`${formId}-receipt`}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0] ?? null;
                                      if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
                                        setReceiptFile(null);
                                        setReceiptFileName("");
                                        setPaymentError("Choose a JPG, PNG, or WebP receipt no larger than 2 MB.");
                                        event.target.value = "";
                                        return;
                                      }
                                      setPaymentError("");
                                      setReceiptFile(file);
                                      setReceiptFileName(file?.name ?? "");
                                    }}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                      {pendingBooking && !holdExpired && !heldPaymentReady && (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>Payment remains disabled</strong><p>Live payment setup could not be verified. Cancel this unpaid hold or refresh before its expiry.</p></div>
                        </div>
                      )}
                      {!pendingBooking && (
                        <div className="security-boundary">
                          <div><strong>Atomic slot hold</strong><p>{isLive ? "Complete the security check, then reserve the slot before paying." : "Simulation only—no real court is reserved and no payment should be sent."}</p></div>
                          {isLive && securitySiteKey ? (
                            <><div ref={turnstileContainerRef} className="turnstile-container" /><span className={turnstileTokenValue ? "security-ready" : "security-waiting"}>{turnstileTokenValue ? "Verified" : "Verification required"}</span></>
                          ) : isLive ? (
                            <div className="payment-error" role="alert"><span aria-hidden="true">!</span><div><strong>Live booking is paused</strong><p>The venue security check has not been configured.</p></div></div>
                          ) : <span className="security-ready">Preview only</span>}
                        </div>
                      )}
                      {paymentError && (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>{pendingBooking ? "Payment" : "Reservation"} needs another look</strong><p>{paymentError}</p></div>
                        </div>
                      )}
                      <p className="secure-note"><span aria-hidden="true">◇</span> {holdExpired ? "Payment is disabled for this unavailable hold." : !isLive ? "This is a simulated checkout. No real court is reserved and no payment should be sent." : pendingBooking && !heldPaymentReady ? "Payment is disabled until live venue configuration is verified." : pendingBooking ? "Your slot is held and becomes confirmed only after payment review." : "Payment details remain hidden until the database reserves your slot."} No card details are collected here.</p>
                      <div className="step-actions">
                        {!pendingBooking && <button className="button button-ghost" type="button" onClick={() => setStep(3)} disabled={isSubmitting}><span aria-hidden="true">←</span> Back</button>}
                        {pendingBooking && <button className="button button-ghost" type="button" onClick={() => void cancelCurrentHold()} disabled={isSubmitting}>{holdExpired ? "Choose a new time" : "Cancel unpaid hold"}</button>}
                        {!holdExpired && (!pendingBooking || heldPaymentReady) && <button data-testid={pendingBooking ? "submit-receipt" : "reserve-slot"} className="button button-blue" type="submit" disabled={isSubmitting}>
                          {isSubmitting ? <><span className="button-spinner" aria-hidden="true" /> {pendingBooking ? "Sending receipt…" : isLive ? "Reserving slot…" : "Creating preview…"}</> : <>{pendingBooking ? isLive ? "Submit payment receipt" : "Submit sample receipt" : isLive ? "Reserve this slot" : "Create preview hold"} <span aria-hidden="true">→</span></>}
                        </button>}
                      </div>
                    </form>
                    <BookingSummary court={selectedCourt} dateLabel={selectedDateDetails?.long ?? selectedDate} duration={checkoutDuration} slot={checkoutSlot} subtotal={checkoutSubtotal} bookingFee={checkoutFee} total={checkoutTotal} />
                  </div>
                )}

                {step === 5 && confirmedBooking && (
                  <div className="confirmation-card" role="status">
                    <div className="confirmation-burst" aria-hidden="true"><span>✓</span></div>
                    <p className="eyebrow eyebrow-dark">{!isLive ? "Preview complete" : confirmedBooking.status === "confirmed" ? "Booking confirmed" : "Receipt received"}</p>
                    <h3>{!isLive ? "You completed the preview." : confirmedBooking.status === "confirmed" ? "Your court is confirmed." : "Your rally is on the board."}</h3>
                    <p className="confirmation-lede">{!isLive ? <>No real reservation or payment was created. This reference is for the current browser preview only.</> : confirmedBooking.status === "confirmed" ? <>Payment was accepted and booking <strong>{confirmedBooking.reference}</strong> is confirmed. Use <strong>{confirmedBooking.customer.email}</strong> to manage it.</> : <>The receipt for <strong>{confirmedBooking.reference}</strong> was received and is awaiting review. Use <strong>{confirmedBooking.customer.email}</strong> to check its status.</>}</p>
                    <div className="confirmation-reference"><span>BOOKING REFERENCE</span><strong>{confirmedBooking.reference}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(confirmedBooking.reference)}>Copy</button></div>
                    <div className="confirmation-details">
                      <div><span>Court</span><strong>{selectedCourt.name}</strong></div>
                      <div><span>Date</span><strong>{selectedDateDetails?.long ?? confirmedBooking.date}</strong></div>
                      <div><span>Time</span><strong>{formatHour(confirmedBooking.startHour)}–{formatHour(confirmedBooking.startHour + confirmedBooking.durationHours)}</strong></div>
                      <div><span>Total</span><strong>{peso(confirmedBooking.amount)}</strong></div>
                    </div>
                    <div className="confirmation-next"><span className="status-pulse" aria-hidden="true" /><div><strong>{!isLive ? "Preview reminder" : confirmedBooking.status === "confirmed" ? "You’re booked" : "What happens next?"}</strong><p>{!isLive ? "Do not travel to the venue or send money based on this preview." : confirmedBooking.status === "confirmed" ? "Keep this reference handy for status checks or owner-assisted changes." : "The club will review the submitted receipt. Keep this reference handy to check status."}</p></div></div>
                    <div className="confirmation-actions">
                      <button className="button button-blue" type="button" onClick={() => {
                        setLookupReference(confirmedBooking.reference);
                        setLookupEmail(confirmedBooking.customer.email);
                        openManage();
                      }}>{isLive ? "Manage this booking" : "Inspect preview status"}</button>
                      <button className="button button-outline" type="button" onClick={resetBooking}>Book another court</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ManageBooking
                formId={formId}
                isPreview={!isLive}
                courts={displayCourts}
                reference={lookupReference}
                email={lookupEmail}
                lookupState={lookupState}
                booking={managedBooking}
                showCancel={showCancel}
                showRescheduleHelp={showRescheduleHelp}
                cancelReason={cancelReason}
                cancelState={cancelState}
                onReferenceChange={setLookupReference}
                onEmailChange={setLookupEmail}
                onLookup={lookupBooking}
                onShowCancel={setShowCancel}
                onShowRescheduleHelp={setShowRescheduleHelp}
                onCancelReasonChange={setCancelReason}
                onConfirmCancel={confirmCancel}
                onBook={() => openBooking()}
              />
            )}
          </div>
        </section>

        <section className="club-note">
          <div className="site-container club-note-inner">
            <p className="eyebrow">Welcome to your next favorite habit</p>
            <h2>Serious court.<br /><span>Playful spirit.</span></h2>
            <button className="button button-lime button-large" type="button" onClick={() => openBooking()}>Find your hour <span aria-hidden="true">→</span></button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-container footer-grid">
          <div><a className="wordmark wordmark-footer" href="#top" aria-label="Dinktopia home"><Image className="brand-logo" src="/dinktopia-logo.png" alt="" width={2046} height={769} sizes="212px" /></a><p>Good games live here.</p></div>
          <div><h2>Play</h2><a href="#courts">Courts</a><button type="button" onClick={() => openBooking()}>Book a court</button><button type="button" onClick={openManage}>Manage booking</button></div>
          <div><h2>Club hours</h2><p>Daily<br /><strong>6:00 AM–10:00 PM</strong></p><small>Asia/Manila · PHP</small></div>
          <div><h2>Setup status</h2><p>Preview booking experience.<br />Venue details coming next.</p></div>
        </div>
        <div className="site-container footer-bottom"><span>© 2026 Dinktopia Pickleball Club</span><span>Made for longer rallies.</span></div>
      </footer>
      <p className="sr-live" aria-live="polite" aria-atomic="true">{liveMessage}</p>
    </div>
  );
}

type BookingSummaryProps = {
  court: Court;
  dateLabel: string;
  duration: number;
  slot: AvailabilitySlot | null;
  subtotal: number;
  bookingFee: number;
  total: number;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
};

function BookingSummary({
  court,
  dateLabel,
  duration,
  slot,
  subtotal,
  bookingFee,
  total,
  actionLabel,
  actionDisabled,
  onAction,
}: BookingSummaryProps) {
  return (
    <aside className="booking-summary" aria-label="Booking summary">
      <div className="summary-score"><span>YOUR PLAY</span><strong>{court.number}</strong></div>
      <div className="summary-heading"><span className="slot-dot" aria-hidden="true" /><p>{slot ? "Ready to reserve" : "Build your booking"}</p></div>
      <h3>{court.name}</h3>
      <dl>
        <div><dt>Date</dt><dd>{dateLabel}</dd></div>
        <div><dt>Time</dt><dd>{slot ? `${slot.startsAt}–${slot.endsAt}` : "Choose a start time"}</dd></div>
        <div><dt>Duration</dt><dd>{duration} {duration === 1 ? "hour" : "hours"}</dd></div>
      </dl>
      <div className="price-breakdown">
        <div><span>Court booking</span><span>{slot ? peso(subtotal) : "—"}</span></div>
        <div><span>Booking fee</span><span>{slot ? peso(bookingFee) : "—"}</span></div>
        <div className="summary-total"><span>Total</span><strong>{slot ? peso(total) : "—"}</strong></div>
      </div>
      {actionLabel && onAction && (
        <button className="button button-lime summary-button" type="button" disabled={actionDisabled} onClick={onAction}>{actionLabel} <span aria-hidden="true">→</span></button>
      )}
      <p className="summary-footnote"><span aria-hidden="true">◇</span> No surprise fees. Prices are shown in PHP.</p>
    </aside>
  );
}

type ManageBookingProps = {
  formId: string;
  isPreview: boolean;
  courts: Court[];
  reference: string;
  email: string;
  lookupState: "idle" | "loading" | "found" | "empty" | "error";
  booking: BookingRecord | null;
  showCancel: boolean;
  showRescheduleHelp: boolean;
  cancelReason: string;
  cancelState: "idle" | "loading" | "success" | "error";
  onReferenceChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onLookup: (event: FormEvent<HTMLFormElement>) => void;
  onShowCancel: (show: boolean) => void;
  onShowRescheduleHelp: (show: boolean) => void;
  onCancelReasonChange: (value: string) => void;
  onConfirmCancel: () => void;
  onBook: () => void;
};

function ManageBooking({
  formId,
  isPreview,
  courts,
  reference,
  email,
  lookupState,
  booking,
  showCancel,
  showRescheduleHelp,
  cancelReason,
  cancelState,
  onReferenceChange,
  onEmailChange,
  onLookup,
  onShowCancel,
  onShowRescheduleHelp,
  onCancelReasonChange,
  onConfirmCancel,
  onBook,
}: ManageBookingProps) {
  const court = courts.find((item) => item.id === booking?.courtId) ?? courts[0];
  const formattedDate = booking
    ? new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${booking.date}T12:00:00Z`))
    : "";

  return (
    <div className="manage-shell">
      <div className="manage-intro">
        <span className="manage-orbit" aria-hidden="true"><i /></span>
        <p className="eyebrow">Your booking, your call</p>
        <h3>Check status or change plans.</h3>
        <p>Use the same device, booking reference, and email from checkout. No password or account required.</p>
        {isPreview && <div className="manage-demo-note"><strong>Preview a found booking</strong><span>Reference: DT-260808-018<br />Email: mika@example.com</span></div>}
      </div>
      <div className="manage-panel">
        <form className="lookup-form" onSubmit={onLookup} noValidate>
          <div className="form-field">
            <label htmlFor={`${formId}-lookup-reference`}>Booking reference</label>
            <input id={`${formId}-lookup-reference`} value={reference} onChange={(event) => onReferenceChange(event.target.value.toUpperCase())} placeholder="DT-YYMMDD-000" autoComplete="off" />
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-lookup-email`}>Email address</label>
            <input id={`${formId}-lookup-email`} type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <button className="button button-blue" type="submit" disabled={lookupState === "loading"}>{lookupState === "loading" ? <><span className="button-spinner" aria-hidden="true" /> Finding booking…</> : <>Find booking <span aria-hidden="true">→</span></>}</button>
        </form>

        {lookupState === "idle" && <div className="manage-placeholder"><span aria-hidden="true">⌕</span><p>Your booking details will appear here.</p></div>}
        {lookupState === "loading" && <div className="manage-loading" role="status"><span className="spinner" aria-hidden="true" /><div><strong>Looking up your booking…</strong><small>Checking the Dinktopia board.</small></div></div>}
        {lookupState === "error" && <div className="state-card state-error" role="alert"><span className="state-symbol" aria-hidden="true">!</span><div><h4>Check those details</h4><p>Enter your booking reference and the email used at checkout, then try again.</p></div></div>}
        {lookupState === "empty" && <div className="state-card state-empty" role="status"><span className="state-symbol" aria-hidden="true">?</span><div><h4>We couldn&apos;t find that booking.</h4><p>Check for typos. If it still won&apos;t show, the clubhouse team can help.</p></div><button className="button button-outline" type="button" onClick={onBook}>Start a new booking</button></div>}

        {lookupState === "found" && booking && (
          <div className={`managed-booking ${booking.status === "cancelled" ? "is-cancelled" : ""}`}>
            <div className="managed-heading">
              <div><span className={`booking-status status-${booking.status}`}><i aria-hidden="true" /> {booking.status === "pending_payment" ? isPreview ? "Preview hold" : "Awaiting payment" : booking.status === "payment_review" ? isPreview ? "Preview review" : "Payment review" : booking.status === "confirmed" ? "Confirmed" : "Cancelled"}</span><h4>{booking.reference}</h4></div>
              <span className="managed-court-number">{court.number}</span>
            </div>
            {cancelState === "success" && <div className="notice-banner notice-success" role="status"><div><strong>{isPreview ? "Preview dismissed" : "Booking cancelled"}</strong><span>{isPreview ? "No real court or payment was affected." : "The unpaid hold has been released."}</span></div></div>}
            <dl className="managed-details">
              <div><dt>Court</dt><dd>{court.name}</dd></div>
              <div><dt>Date</dt><dd>{formattedDate}</dd></div>
              <div><dt>Time</dt><dd>{formatHour(booking.startHour)}–{formatHour(booking.startHour + booking.durationHours)}</dd></div>
              <div><dt>Total</dt><dd>{peso(booking.amount)}</dd></div>
            </dl>
            {booking.status === "pending_payment" && <div className="payment-due-note"><span aria-hidden="true">◷</span><div><strong>{isPreview ? "Preview only" : "Payment has not been submitted"}</strong><p>{isPreview ? "No real reservation or payment exists. This simulated hold can be dismissed online." : "This unpaid hold can be cancelled online until its server-controlled expiry."}</p></div></div>}
            {(booking.status === "payment_review" || booking.status === "confirmed") && <div className="payment-due-note"><span aria-hidden="true">◎</span><div><strong>{isPreview ? "Preview record only" : "Owner assistance is required for cancellation"}</strong><p>{isPreview ? "No real reservation or payment exists, so no venue action is required." : "Paid and payment-review bookings follow the venue’s published policy and cannot be cancelled through this screen."}</p></div></div>}
            {booking.status !== "cancelled" && !showCancel && (
              <div className="managed-actions"><button className="button button-blue" type="button" onClick={() => onShowRescheduleHelp(!showRescheduleHelp)}>Reschedule options</button>{booking.status === "pending_payment" && <button className="button button-outline danger-button" type="button" onClick={() => onShowCancel(true)}>Cancel unpaid hold</button>}</div>
            )}
            {showRescheduleHelp && booking.status !== "cancelled" && !showCancel && (
              <div className="reschedule-help" role="status">
                <span aria-hidden="true">↺</span>
                <div><strong>{isPreview ? "Rescheduling preview" : "Rescheduling is owner-assisted"}</strong><p>{isPreview ? "This demonstrates where change options appear. No real court has been reserved." : "The venue owner or administrator moves confirmed bookings through the platform’s protected rescheduling flow. Online requests will become available after the clubhouse contact channel is activated."}</p><button type="button" onClick={() => navigator.clipboard?.writeText(booking.reference)}>Copy booking reference</button></div>
              </div>
            )}
            {showCancel && booking.status === "pending_payment" && (
              <div className="cancel-panel">
                <div><h5>{isPreview ? "Dismiss this preview?" : "Cancel this booking?"}</h5><p>{isPreview ? "No real court or payment will be affected." : "This releases the court. Paid bookings require owner assistance."}</p></div>
                <div className="form-field"><label htmlFor={`${formId}-cancel-reason`}>Reason for cancellation</label><select id={`${formId}-cancel-reason`} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)}><option value="">Choose a reason</option><option value="plans-changed">Plans changed</option><option value="weather">Weather or travel</option><option value="wrong-time">Booked the wrong time</option><option value="other">Something else</option></select></div>
                {cancelState === "error" && <p className="field-error" role="alert">Cancellation could not be completed. Try again.</p>}
                <div className="cancel-actions"><button className="button button-ghost" type="button" onClick={() => onShowCancel(false)} disabled={cancelState === "loading"}>Keep booking</button><button className="button button-danger" type="button" disabled={!cancelReason || cancelState === "loading"} onClick={onConfirmCancel}>{cancelState === "loading" ? "Cancelling…" : "Yes, cancel booking"}</button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
