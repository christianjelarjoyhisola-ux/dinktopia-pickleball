import { activeTenant } from "../tenants/registry";
import {
  currentOwnerSession,
  getActivationSettings,
  listManagerBlocks,
  listManagerBookings,
  platformMode,
} from "../lib/platform/client";

export type TenantRole = "owner" | "admin" | "staff" | "host";

export type ManagementCapability =
  | "booking:create"
  | "booking:update"
  | "booking:cancel"
  | "booking:check-in"
  | "schedule:block"
  | "customer:view"
  | "report:view"
  | "settings:update"
  | "tenant:publish";

export type ManagementContext = {
  tenantSlug: string;
  role: TenantRole;
  capabilities: ManagementCapability[];
};

export type BookingStatus =
  | "confirmed"
  | "awaiting_payment"
  | "checked_in"
  | "completed";

export type Booking = {
  id: string;
  customer: string;
  initials: string;
  phone: string;
  court: string;
  date: string;
  time: string;
  duration: string;
  amount: number;
  status: BookingStatus;
  payment: "paid" | "unpaid";
};

export type Customer = {
  id: string;
  name: string;
  initials: string;
  contact: string;
  visits: number;
  lifetimeValue: number;
  lastVisit: string;
  note?: string;
};

export type Court = {
  id: string;
  name: string;
  surface: string;
  status: "open" | "maintenance";
  rateDay: number;
  ratePeak: number;
};

export type ScheduleSlot = {
  id: string;
  courtId: string;
  start: string;
  end: string;
  label: string;
  detail: string;
  kind: "booking" | "hold" | "block";
};

export type CourtBlock = {
  id: string;
  court: string;
  date: string;
  time: string;
  reason: string;
  createdBy: string;
};

export type SetupItem = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
};

export type ManagementSnapshot = {
  tenant: {
    slug: string;
    name: string;
    venueLabel: string;
    timezone: string;
    currency: "PHP";
    mode: "preview" | "live";
    lastSynced: string;
  };
  bookings: Booking[];
  customers: Customer[];
  courts: Court[];
  schedule: ScheduleSlot[];
  blocks: CourtBlock[];
  setup: SetupItem[];
};

/**
 * The management route consumes this interface only. The production adapter can
 * map the shared tenant/auth/API response to this shape without changing the UI.
 * Capabilities must come from the authenticated server session; the client never
 * treats the preview role selector as authority.
 */
export interface ManagementAdapter {
  load(context: ManagementContext): Promise<ManagementSnapshot>;
  perform(
    context: ManagementContext,
    action: { type: string; resourceId?: string; payload?: unknown },
  ): Promise<{ ok: true; message: string }>;
}

export const previewRoleSessions: Record<TenantRole, ManagementCapability[]> = {
  owner: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "customer:view",
    "report:view",
    "settings:update",
  ],
  admin: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "customer:view",
    "report:view",
    "settings:update",
  ],
  staff: [
    "booking:create",
    "customer:view",
  ],
  host: [],
};

export const previewSnapshot: ManagementSnapshot = {
  tenant: {
    slug: activeTenant.identity.slug,
    name: activeTenant.identity.shortName,
    venueLabel: `${activeTenant.identity.shortName} · Preview venue`,
    timezone: activeTenant.identity.timezone,
    currency: activeTenant.identity.currency,
    mode: "preview",
    lastSynced: "Today, 2:18 PM",
  },
  courts: [
    {
      id: activeTenant.previewCourts[0].id,
      name: activeTenant.previewCourts[0].name,
      surface: activeTenant.previewCourts[0].surface,
      status: "open",
      rateDay: activeTenant.booking.offPeakHourlyRate,
      ratePeak: activeTenant.booking.peakHourlyRate,
    },
    {
      id: activeTenant.previewCourts[1].id,
      name: activeTenant.previewCourts[1].name,
      surface: activeTenant.previewCourts[1].surface,
      status: "open",
      rateDay: activeTenant.booking.offPeakHourlyRate,
      ratePeak: activeTenant.booking.peakHourlyRate,
    },
  ],
  bookings: [
    {
      id: "DT-2848",
      customer: "Arielle Santos",
      initials: "AS",
      phone: "+63 917 204 1188",
      court: "Court 01",
      date: "Aug 8",
      time: "6:00–7:00 PM",
      duration: "1 hr",
      amount: 400,
      status: "confirmed",
      payment: "paid",
    },
    {
      id: "DT-2849",
      customer: "Miguel Tan",
      initials: "MT",
      phone: "+63 945 808 2104",
      court: "Court 02",
      date: "Aug 8",
      time: "7:00–9:00 PM",
      duration: "2 hrs",
      amount: 800,
      status: "awaiting_payment",
      payment: "unpaid",
    },
    {
      id: "DT-2850",
      customer: "Bea Cruz",
      initials: "BC",
      phone: "+63 998 312 7710",
      court: "Court 01",
      date: "Aug 8",
      time: "8:00–9:00 PM",
      duration: "1 hr",
      amount: 400,
      status: "checked_in",
      payment: "paid",
    },
    {
      id: "DT-2841",
      customer: "Nico de Leon",
      initials: "ND",
      phone: "+63 917 511 6024",
      court: "Court 02",
      date: "Aug 8",
      time: "3:00–5:00 PM",
      duration: "2 hrs",
      amount: 600,
      status: "completed",
      payment: "paid",
    },
    {
      id: "DT-2854",
      customer: "Thea Lim",
      initials: "TL",
      phone: "+63 905 440 0389",
      court: "Court 02",
      date: "Aug 9",
      time: "9:00–10:00 AM",
      duration: "1 hr",
      amount: 300,
      status: "confirmed",
      payment: "paid",
    },
  ],
  schedule: [
    {
      id: "slot-01",
      courtId: activeTenant.previewCourts[0].id,
      start: "09:00",
      end: "10:00",
      label: "Lara V.",
      detail: "Paid · 1 hr",
      kind: "booking",
    },
    {
      id: "slot-02",
      courtId: activeTenant.previewCourts[1].id,
      start: "10:00",
      end: "12:00",
      label: "Team North",
      detail: "Paid · 2 hrs",
      kind: "booking",
    },
    {
      id: "slot-03",
      courtId: activeTenant.previewCourts[0].id,
      start: "13:00",
      end: "14:00",
      label: "Payment hold",
      detail: "Expires 2:32 PM",
      kind: "hold",
    },
    {
      id: "slot-04",
      courtId: activeTenant.previewCourts[1].id,
      start: "14:00",
      end: "15:00",
      label: "Maintenance",
      detail: "Net adjustment",
      kind: "block",
    },
    {
      id: "slot-05",
      courtId: activeTenant.previewCourts[0].id,
      start: "18:00",
      end: "19:00",
      label: "Arielle S.",
      detail: "Paid · 1 hr",
      kind: "booking",
    },
    {
      id: "slot-06",
      courtId: activeTenant.previewCourts[1].id,
      start: "19:00",
      end: "21:00",
      label: "Miguel T.",
      detail: "Payment due",
      kind: "hold",
    },
  ],
  blocks: [
    {
      id: "BLK-040",
      court: "Court 02",
      date: "Aug 8, 2026",
      time: "2:00–3:00 PM",
      reason: "Net adjustment",
      createdBy: "Mara · admin",
    },
    {
      id: "BLK-039",
      court: "Both courts",
      date: "Aug 12, 2026",
      time: "6:00–8:00 AM",
      reason: "Monthly deep clean",
      createdBy: "Alex · owner",
    },
  ],
  customers: [
    {
      id: "CUS-1091",
      name: "Arielle Santos",
      initials: "AS",
      contact: "+63 917 204 1188",
      visits: 14,
      lifetimeValue: 6200,
      lastVisit: "Today",
      note: "Prefers Court 01",
    },
    {
      id: "CUS-1034",
      name: "Miguel Tan",
      initials: "MT",
      contact: "+63 945 808 2104",
      visits: 9,
      lifetimeValue: 5100,
      lastVisit: "Today",
    },
    {
      id: "CUS-1170",
      name: "Bea Cruz",
      initials: "BC",
      contact: "+63 998 312 7710",
      visits: 6,
      lifetimeValue: 2700,
      lastVisit: "Today",
      note: "New league inquiry",
    },
    {
      id: "CUS-0988",
      name: "Nico de Leon",
      initials: "ND",
      contact: "+63 917 511 6024",
      visits: 21,
      lifetimeValue: 9400,
      lastVisit: "Today",
    },
  ],
  setup: [
    {
      id: "brand",
      label: "Tenant identity",
      detail: "Dinktopia name, slug and brand palette",
      complete: true,
    },
    {
      id: "courts",
      label: "Court inventory",
      detail: "2 preview courts configured",
      complete: true,
    },
    {
      id: "hours",
      label: "Operating hours",
      detail: "Daily, 6:00 AM–10:00 PM",
      complete: true,
    },
    {
      id: "rates",
      label: "Preview rates",
      detail: "₱300 day / ₱400 peak per hour",
      complete: true,
    },
    {
      id: "venue",
      label: "Verify venue details",
      detail: "Confirm final address and court names",
      complete: false,
    },
    {
      id: "payment",
      label: "Connect payments",
      detail: "Add the verified GCash destination",
      complete: false,
    },
    {
      id: "policy",
      label: "Approve customer rules",
      detail: "Confirm cancellation and reschedule policy",
      complete: false,
    },
    {
      id: "owner",
      label: "Verify owner & domain",
      detail: "Activate owner account and booking URL",
      complete: false,
    },
  ],
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const managementAdapter: ManagementAdapter = {
  async load() {
    if (platformMode() === "preview") {
      await delay(240);
      return previewSnapshot;
    }

    const session = await currentOwnerSession();
    if (!session) {
      throw new Error("MANAGER_SIGN_IN_REQUIRED");
    }

    const [bookingResult, blockResult, activationResult] = await Promise.all([
      listManagerBookings(session.access_token, { activeOnly: true, limit: 100 }),
      listManagerBlocks(session.access_token, { limit: 100 }),
      getActivationSettings(session.access_token).catch(() => null),
    ]);

    const bookingRows = bookingResult.bookings;
    const blockRows = blockResult.blockedDates;
    const settings = liveActivationSettings(activationResult);
    const tenantSettings = record(settings?.tenant);
    const responseSlug = tenantSettings
      ? value(tenantSettings, ["slug"])
      : "";
    if (settings && responseSlug !== activeTenant.identity.slug) {
      throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
    }

    const tenantName = tenantSettings
      ? value(
          tenantSettings,
          ["displayName", "name"],
          activeTenant.identity.name,
        )
      : activeTenant.identity.name;
    const bookings = bookingRows.map(mapLiveBooking);
    const blocks = blockRows.map(mapLiveBlock);

    return {
      tenant: {
        slug: activeTenant.identity.slug,
        name: tenantName,
        venueLabel: tenantName,
        timezone: activeTenant.identity.timezone,
        currency: activeTenant.identity.currency,
        mode: "live",
        lastSynced: formatManilaDateTime(new Date()),
      },
      bookings,
      customers: deriveLiveCustomers(bookingRows),
      courts: [],
      schedule: deriveLiveSchedule(bookingRows, blockRows),
      blocks,
      setup: liveSetup(settings),
    };
  },
  async perform(_context, action) {
    if (platformMode() === "live") {
      throw new Error("LIVE_MUTATION_NOT_CONNECTED");
    }
    await delay(320);
    return {
      ok: true,
      message:
        action.type === "tenant:publish"
          ? "Preview acknowledged. Live activation stays locked until setup is complete."
          : "Preview action completed. No production data was changed.",
    };
  },
};

type JsonObject = Record<string, unknown>;

function record(candidate: unknown): JsonObject | null {
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as JsonObject)
    : null;
}

function value(row: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function numberValue(row: JsonObject, keys: string[]): number | null {
  let candidate: unknown;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      candidate = row[key];
      break;
    }
  }
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bookingAmount(row: JsonObject): number {
  const total = numberValue(row, ["total_amount", "totalAmount", "amount"]);
  if (total !== null) return Math.max(0, total);
  const subtotal = numberValue(row, ["subtotal_amount", "subtotalAmount"]);
  const serviceFee = numberValue(row, [
    "service_fee_amount",
    "serviceFeeAmount",
  ]);
  return Math.max(0, (subtotal ?? 0) + (serviceFee ?? 0));
}

function liveStatus(row: JsonObject): BookingStatus {
  const status = value(row, ["status"]).toLowerCase();
  if (status === "confirmed") return "confirmed";
  if (status === "completed") return "completed";
  if (status === "pending_payment" || status === "payment_review") {
    return "awaiting_payment";
  }
  throw new Error("LIVE_BOOKING_STATUS_INVALID");
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "—";
}

function parsedInstant(row: JsonObject, keys: string[]): Date | null {
  const raw = value(row, keys);
  if (!raw) return null;
  const candidate = new Date(raw);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function formatManilaDate(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaDateTime(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaTime(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaClock(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function localCalendarDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const candidate = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function bookingDateLabel(row: JsonObject, startsAt: Date | null): string {
  const localDate = value(row, ["local_booking_date"]);
  const calendarDate = localCalendarDate(localDate);
  if (calendarDate) return formatManilaDate(calendarDate);
  return startsAt ? formatManilaDate(startsAt) : "Date unavailable";
}

function bookingTimeLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "Time unavailable";
  return `${formatManilaTime(startsAt)}–${formatManilaTime(endsAt)}`;
}

function durationLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "—";
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const parts = [
    hours ? `${hours} ${hours === 1 ? "hr" : "hrs"}` : "",
    remainder ? `${remainder} min` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function courtLabel(courtId: string, allCourtsLabel = "Court unavailable"): string {
  if (!courtId) return allCourtsLabel;
  return `Court · ${courtId.slice(0, 8)}`;
}

function mapLiveBooking(row: JsonObject): Booking {
  const id = value(row, ["reference", "booking_reference", "id"]);
  const customer = value(row, ["customer_name", "customerName", "name"]);
  const courtId = value(row, ["court_id"]);
  if (!id || !customer || !courtId) {
    throw new Error("LIVE_BOOKING_ROW_INVALID");
  }
  const startsAt = parsedInstant(row, ["starts_at"]);
  const endsAt = parsedInstant(row, ["ends_at"]);
  const paymentStatus = value(row, ["payment_status", "paymentStatus"]).toLowerCase();
  const phone = value(row, ["customer_phone", "phone", "mobile"]);
  const email = value(row, ["customer_email", "customerEmail"]);
  return {
    id,
    customer,
    initials: initialsFor(customer),
    phone: phone || email || "Contact unavailable",
    court: value(row, ["court_name", "courtName"], courtLabel(courtId)),
    date: bookingDateLabel(row, startsAt),
    time: bookingTimeLabel(startsAt, endsAt),
    duration: durationLabel(startsAt, endsAt),
    amount: bookingAmount(row),
    status: liveStatus(row),
    payment: paymentStatus === "paid" ? "paid" : "unpaid",
  };
}

function normalizedClock(raw: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function localBlockInstant(date: string, clock: string): Date | null {
  const normalized = normalizedClock(clock);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !normalized) return null;
  const candidate = new Date(`${date}T${normalized}:00+08:00`);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function mapLiveBlock(row: JsonObject): CourtBlock {
  const id = value(row, ["id"]);
  const blockedOn = value(row, ["blocked_on"]);
  if (!id || !blockedOn) throw new Error("LIVE_BLOCK_ROW_INVALID");
  const startRaw = value(row, ["starts_at"]);
  const endRaw = value(row, ["ends_at"]);
  const start = localBlockInstant(blockedOn, startRaw);
  const end = localBlockInstant(blockedOn, endRaw);
  const date = localCalendarDate(blockedOn);
  const courtId = value(row, ["court_id"]);
  return {
    id,
    court: courtLabel(courtId, "All courts"),
    date: date ? formatManilaDate(date) : "Date unavailable",
    time: start && end
      ? `${formatManilaTime(start)}–${formatManilaTime(end)}`
      : "All day",
    reason: value(row, ["internal_reason", "public_label", "reason"], "Court unavailable"),
    createdBy: "Authorized tenant session",
  };
}

function liveActivationSettings(result: JsonObject | null): JsonObject | null {
  const envelope = record(result);
  return record(envelope?.settings);
}

function booleanValue(row: JsonObject | null, key: string): boolean {
  return row?.[key] === true;
}

function humanizeReason(reason: string): string {
  return reason.toLowerCase().replaceAll("_", " ");
}

function liveSetup(settings: JsonObject | null): SetupItem[] {
  if (!settings) {
    return [{
      id: "readiness-unavailable",
      label: "Launch readiness unavailable",
      detail: "This signed-in role cannot read tenant activation settings.",
      complete: false,
    }];
  }

  const readiness = record(settings.readiness);
  const setupStatus = value(settings, ["setupStatus"], "setup_required");
  const reasons = Array.isArray(readiness?.blockingReasons)
    ? readiness.blockingReasons.filter(
        (reason): reason is string => typeof reason === "string" && Boolean(reason),
      )
    : [];
  const item = (
    id: string,
    label: string,
    key: string,
    readyDetail: string,
    missingDetail: string,
  ): SetupItem => ({
    id,
    label,
    detail: booleanValue(readiness, key) ? readyDetail : missingDetail,
    complete: booleanValue(readiness, key),
  });

  return [
    {
      id: "setup-status",
      label: "Tenant setup status",
      detail: `Platform status: ${humanizeReason(setupStatus)}`,
      complete: setupStatus === "active" && booleanValue(readiness, "setupActive"),
    },
    item(
      "domain",
      "Booking domain",
      "domainConfigured",
      "An active tenant domain is registered.",
      "Register and verify the production booking domain.",
    ),
    item(
      "court-pricing",
      "Court pricing",
      "courtPricingConfigured",
      "At least one active court has valid pricing.",
      "Publish valid pricing for an active court.",
    ),
    item(
      "billing",
      "Platform billing",
      "billingConfigured",
      "The platform billing rule is configured.",
      "Configure the platform billing rule.",
    ),
    item(
      "payment",
      "Customer payments",
      "paymentConfigured",
      "An active customer payment method is configured.",
      "Add and verify a customer payment destination.",
    ),
    item(
      "remittance",
      "Platform remittance",
      "remittanceConfigured",
      "The platform remittance destination is configured.",
      "Configure the platform remittance destination.",
    ),
    item(
      "email",
      "Booking email",
      "emailConfigured",
      "The booking Reply-To address is configured.",
      "Configure the booking Reply-To address.",
    ),
    {
      id: "public-booking",
      label: "Public booking gate",
      detail: booleanValue(readiness, "publicBookingEnabled")
        ? "Public booking is enabled by the shared platform."
        : reasons.length
          ? `Blocked: ${reasons.map(humanizeReason).join(", ")}.`
          : "Public booking is disabled by tenant configuration.",
      complete: booleanValue(readiness, "publicBookingEnabled"),
    },
  ];
}

function deriveLiveSchedule(
  bookingRows: JsonObject[],
  blockRows: JsonObject[],
): ScheduleSlot[] {
  const bookingSlots = bookingRows.map((row) => {
    const booking = mapLiveBooking(row);
    const startsAt = parsedInstant(row, ["starts_at"]);
    const endsAt = parsedInstant(row, ["ends_at"]);
    const rawStatus = value(row, ["status"]);
    return {
      id: booking.id,
      courtId: value(row, ["court_id"]),
      start: startsAt ? formatManilaClock(startsAt) : "00:00",
      end: endsAt ? formatManilaClock(endsAt) : "00:00",
      label: booking.customer,
      detail: `${humanizeReason(rawStatus)} · ${booking.duration}`,
      kind:
        rawStatus === "pending_payment" || rawStatus === "payment_review"
          ? "hold"
          : "booking",
    } satisfies ScheduleSlot;
  });

  const blockSlots = blockRows.map((row) => {
    const block = mapLiveBlock(row);
    return {
      id: block.id,
      courtId: value(row, ["court_id"], "all-courts"),
      start: normalizedClock(value(row, ["starts_at"])) ?? "00:00",
      end: normalizedClock(value(row, ["ends_at"])) ?? "23:59",
      label: block.reason,
      detail: block.court,
      kind: "block",
    } satisfies ScheduleSlot;
  });

  return [...bookingSlots, ...blockSlots];
}

type CustomerAccumulator = Customer & {
  key: string;
  latestCompletedAt: number | null;
};

function stableCustomerId(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `customer-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function deriveLiveCustomers(bookingRows: JsonObject[]): Customer[] {
  const customers = new Map<string, CustomerAccumulator>();
  for (const row of bookingRows) {
    const name = value(row, ["customer_name", "customerName"]);
    if (!name) continue;
    const email = value(row, ["customer_email", "customerEmail"]).toLowerCase();
    const phone = value(row, ["customer_phone", "phone", "mobile"]);
    const key = email || phone.replace(/\D/g, "") || name.toLowerCase();
    const existing = customers.get(key) ?? {
      key,
      id: stableCustomerId(key),
      name,
      initials: initialsFor(name),
      contact: phone || email || "Contact unavailable",
      visits: 0,
      lifetimeValue: 0,
      lastVisit: "No completed visit",
      note: "Derived from the loaded booking result",
      latestCompletedAt: null,
    };
    const status = value(row, ["status"]);
    const paymentStatus = value(row, ["payment_status"]);
    const endsAt = parsedInstant(row, ["ends_at"]);
    if (status === "completed") {
      existing.visits += 1;
      if (
        endsAt &&
        (existing.latestCompletedAt === null || endsAt.getTime() > existing.latestCompletedAt)
      ) {
        existing.latestCompletedAt = endsAt.getTime();
        existing.lastVisit = formatManilaDate(endsAt);
      }
    }
    if (paymentStatus === "paid") {
      existing.lifetimeValue += bookingAmount(row);
    }
    customers.set(key, existing);
  }

  return [...customers.values()]
    .sort((left, right) => left.name.localeCompare(right.name, "en-PH"))
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      initials: customer.initials,
      contact: customer.contact,
      visits: customer.visits,
      lifetimeValue: customer.lifetimeValue,
      lastVisit: customer.lastVisit,
      note: customer.note,
    }));
}

export const formatPeso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
