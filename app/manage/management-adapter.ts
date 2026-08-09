import { activeTenant } from "../tenants/registry";
import { normalizeTwoBandSchedule } from "../lib/operating-hours";
import {
  activateTenantInitially,
  applySharedCourtSchedule,
  currentOwnerSession,
  getActivationSettings,
  getBlockedDateAccess,
  getManagerCourts,
  getManagerSession,
  listManagerBlocks,
  listManagerBookings,
  manageBlockedDates,
  manageTenantCourt,
  platformMode,
  updateActivationSettings,
  updateBusinessSettings,
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

export type BookingPaymentStatus =
  | "unpaid"
  | "pending"
  | "partial"
  | "paid"
  | "refunded"
  | "rejected"
  | "unknown";

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
  payment: BookingPaymentStatus;
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
  slug: string;
  name: string;
  description: string;
  surface: string;
  status: "active" | "inactive" | "maintenance";
  sortOrder: number;
  opensAt: string | null;
  closesAt: string | null;
  rateDay: number | null;
  ratePeak: number | null;
};

export type SharedPriceBand = {
  start: string;
  end: string;
  hourlyRate: number;
};

export type ManagementSession = {
  role: TenantRole;
  serverRole: string;
  membershipRole: TenantRole | null;
  isSystemOwner: boolean;
  displayName: string;
  email: string;
  capabilities: ManagementCapability[];
};

export type PaymentMethodConfiguration = {
  methodCode: string;
  displayName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
  qrUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type BusinessPaymentConfiguration = {
  revision: string;
  business: {
    displayName: string;
    contactPhone: string | null;
    facebookUrl: string | null;
    tagline: string | null;
    eventBookingEnabled: boolean;
  };
  venue: {
    replyToEmail: string | null;
    emailEnabled: boolean;
    publicBookingEnabled: boolean;
  };
  paymentMethods: PaymentMethodConfiguration[];
  platformBilling: {
    feeMode: "fixed_per_booking" | "fixed_per_hour" | "percentage";
    feeAmount: number;
    isConfigured: boolean;
  } | null;
};

export type LiveConfiguration = {
  sharedSchedule: {
    opensAt: string;
    closesAt: string;
    bands: SharedPriceBand[];
  } | null;
  scheduleIsUniform: boolean;
  blockAccessExpiresAt: string | null;
  blockAccessStatus: "available" | "unavailable";
  businessPayments: BusinessPaymentConfiguration | null;
  businessPaymentsStatus: "editable" | "incomplete" | "unavailable";
  activationPermissions: {
    canManageVenueSettings: boolean;
    canManagePlatformBilling: boolean;
    canActivatePublicBooking: boolean;
  };
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
  dateValue: string | null;
  time: string;
  reason: string;
  publicLabel: string;
  internalReason: string | null;
  createdBy: string | null;
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
  session: ManagementSession;
  configuration: LiveConfiguration;
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
  courts: activeTenant.previewCourts.map((court) => ({
    id: court.id,
    slug: court.slug,
    name: court.name,
    description: court.description,
    surface: court.surface,
    status: "active",
    sortOrder: activeTenant.previewCourts.findIndex((item) => item.id === court.id),
    opensAt: activeTenant.venue.opensAt,
    closesAt: activeTenant.venue.closesAt,
    rateDay: activeTenant.booking.offPeakHourlyRate,
    ratePeak: activeTenant.booking.peakHourlyRate,
  })),
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
      dateValue: "2026-08-08",
      time: "2:00–3:00 PM",
      reason: "Maintenance",
      publicLabel: "Maintenance",
      internalReason: "Net adjustment",
      createdBy: "Mara · admin",
    },
    {
      id: "BLK-039",
      court: "All courts",
      date: "Aug 12, 2026",
      dateValue: "2026-08-12",
      time: "6:00–8:00 AM",
      reason: "Closed",
      publicLabel: "Closed",
      internalReason: "Monthly deep clean",
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
      detail: `${activeTenant.previewCourts.length} preview courts configured`,
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
  session: {
    role: "owner",
    serverRole: "preview",
    membershipRole: "owner",
    isSystemOwner: false,
    displayName: "Alex Rivera",
    email: "Preview session",
    capabilities: previewRoleSessions.owner,
  },
  configuration: {
    sharedSchedule: {
      opensAt: activeTenant.venue.opensAt,
      closesAt: activeTenant.venue.closesAt,
      bands: [
        {
          start: activeTenant.venue.opensAt,
          end: activeTenant.booking.offPeakEndsAt,
          hourlyRate: activeTenant.booking.offPeakHourlyRate,
        },
        {
          start: activeTenant.booking.offPeakEndsAt,
          end: activeTenant.venue.closesAt,
          hourlyRate: activeTenant.booking.peakHourlyRate,
        },
      ],
    },
    scheduleIsUniform: true,
    blockAccessExpiresAt: null,
    blockAccessStatus: "available",
    businessPayments: null,
    businessPaymentsStatus: "unavailable",
    activationPermissions: {
      canManageVenueSettings: true,
      canManagePlatformBilling: false,
      canActivatePublicBooking: false,
    },
  },
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const managementAdapter: ManagementAdapter = {
  async load(context) {
    if (platformMode() === "preview") {
      await delay(240);
      return previewSnapshot;
    }

    assertDinktopiaContext(context);

    const session = await currentOwnerSession();
    if (!session) {
      throw new Error("MANAGER_SIGN_IN_REQUIRED");
    }

    const serverSession = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    const canReadManagerSettings = serverSession.isSystemOwner ||
      serverSession.membershipRole === "owner" ||
      serverSession.membershipRole === "admin";

    const [
      bookingResult,
      blockResult,
      activationResult,
      courtResult,
      blockAccessResult,
    ] = await Promise.all([
      listManagerBookings(session.access_token, { activeOnly: true, limit: 100 }),
      listManagerBlocks(session.access_token, { limit: 100 }),
      canReadManagerSettings
        ? getActivationSettings(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getManagerCourts(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getBlockedDateAccess(session.access_token).catch(() => null)
        : Promise.resolve(null),
    ]);

    const bookingRows = bookingResult.bookings;
    const blockRows = blockResult.blockedDates;
    const settings = liveActivationSettings(activationResult);
    const courtRows = Array.isArray(courtResult) ? courtResult : [];
    const courts = courtRows.map(mapLiveCourt);
    const courtNames = new Map(courts.map((court) => [court.id, court.name]));
    const activationPermissions = activationPermissionState(settings);
    const businessPayments = businessPaymentConfiguration(settings);
    const blockAccess = record(blockAccessResult);
    const capabilities = liveCapabilities({
      session: serverSession,
      canManageVenueSettings:
        courtResult !== null && activationPermissions.canManageVenueSettings,
      canManageBlocks: blockAccess?.canManage === true,
      canActivatePublicBooking:
        activationPermissions.canActivatePublicBooking,
    });
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
    const bookings = bookingRows.map((row) => mapLiveBooking(row, courtNames));
    const blocks = blockRows.map((row) => mapLiveBlock(row, courtNames));

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
      courts,
      schedule: deriveLiveSchedule(bookingRows, blockRows, courtNames),
      blocks,
      setup: liveSetup(settings),
      session: { ...serverSession, capabilities },
      configuration: {
        ...sharedLiveConfiguration(courtRows),
        blockAccessExpiresAt: value(blockAccess ?? {}, ["expiresAt"]) || null,
        blockAccessStatus: blockAccessResult === null ? "unavailable" : "available",
        businessPayments,
        businessPaymentsStatus: settings === null
          ? "unavailable"
          : businessPayments
            ? "editable"
            : "incomplete",
        activationPermissions,
      },
    };
  },
  async perform(context, action) {
    if (platformMode() === "preview") {
      await delay(320);
      return {
        ok: true,
        message:
          action.type === "tenant:publish"
            ? "Preview acknowledged. Live activation stays locked until setup is complete."
            : "Preview action completed. No production data was changed.",
      };
    }

    assertDinktopiaContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );

    if (
      action.type === "court:create" || action.type === "court:update" ||
      action.type === "court:delete" || action.type === "settings:schedule"
    ) {
      assertVenueManager(authority);
      if (action.type === "court:create") {
        await manageTenantCourt(session.access_token, {
          action: "save",
          patch: courtMutationPatch(action.payload, true),
        });
        return { ok: true, message: "The court was created for Dinktopia." };
      }
      if (action.type === "court:update") {
        await manageTenantCourt(session.access_token, {
          action: "save",
          courtId: requiredUuid(action.resourceId, "COURT_ID_INVALID"),
          patch: courtMutationPatch(action.payload, false),
        });
        return { ok: true, message: "The court settings were saved." };
      }
      if (action.type === "court:delete") {
        assertNoPayload(action.payload);
        await manageTenantCourt(session.access_token, {
          action: "delete",
          courtId: requiredUuid(action.resourceId, "COURT_ID_INVALID"),
        });
        return { ok: true, message: "The court was permanently removed." };
      }
      await applySharedCourtSchedule(
        session.access_token,
        sharedSchedulePayload(action.payload),
      );
      return {
        ok: true,
        message: "Shared operating hours and rates were saved for every court.",
      };
    }

    if (action.type === "schedule:block" || action.type === "schedule:unblock") {
      const access = record(await getBlockedDateAccess(session.access_token));
      if (access?.canManage !== true) throw new Error("SCHEDULE_BLOCK_ACCESS_DENIED");
      if (action.type === "schedule:unblock") {
        assertNoPayload(action.payload);
        await manageBlockedDates(session.access_token, {
          action: "delete",
          blockId: requiredUuid(action.resourceId, "BLOCK_ID_INVALID"),
        });
        return { ok: true, message: "The court block was removed." };
      }
      const block = blockedDatePayload(action.payload);
      await manageBlockedDates(session.access_token, { action: "create", ...block });
      return { ok: true, message: "The court block was created." };
    }

    if (action.type === "business:update" || action.type === "activation:update") {
      assertVenueManager(authority);
      const activation = liveActivationSettings(
        await getActivationSettings(session.access_token),
      );
      const permissions = activationPermissionState(activation);
      if (!permissions.canManageVenueSettings) {
        throw new Error("SETTINGS_UPDATE_ACCESS_DENIED");
      }
      const businessAction = action.type === "business:update"
        ? businessActionPayload(action.payload)
        : null;
      const patch = businessAction?.patch ?? settingsPatch(
        action.payload,
        "activation:update",
      );
      if (
        action.type === "activation:update" &&
        ("platformBilling" in patch || "openPlayServiceFee" in patch) &&
        !permissions.canManagePlatformBilling
      ) {
        throw new Error("PLATFORM_BILLING_ACCESS_DENIED");
      }
      if (action.type === "business:update") {
        await updateBusinessSettings(
          session.access_token,
          businessAction!.expectedRevision,
          patch,
        );
      } else {
        await updateActivationSettings(session.access_token, patch);
      }
      return { ok: true, message: "The protected venue settings were saved." };
    }

    if (action.type === "tenant:publish") {
      assertNoPayload(action.payload);
      if (!authority.isSystemOwner) throw new Error("PLATFORM_OWNER_REQUIRED");
      const activation = liveActivationSettings(
        await getActivationSettings(session.access_token),
      );
      if (!activationPermissionState(activation).canActivatePublicBooking) {
        throw new Error("TENANT_ACTIVATION_ACCESS_DENIED");
      }
      await activateTenantInitially(session.access_token);
      return { ok: true, message: "Dinktopia public booking was activated." };
    }

    throw new Error("LIVE_ACTION_UNSUPPORTED");
  },
};

type JsonObject = Record<string, unknown>;

type VerifiedManagerSession = Omit<ManagementSession, "capabilities">;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WHOLE_HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHARED_SUPABASE_ORIGIN = "https://neqvrwtofiolcuxewdze.supabase.co";
const PUBLIC_PAYMENT_ASSET_PREFIX =
  "/storage/v1/object/public/tenant-public-assets/";
const BLOCK_LABELS = new Set([
  "Reserved",
  "Private Event",
  "Maintenance",
  "Closed",
] as const);

export function isAllowedCustomerQrUrl(candidate: string): boolean {
  const absolutePrefix = `${SHARED_SUPABASE_ORIGIN}${PUBLIC_PAYMENT_ASSET_PREFIX}`;
  if (
    !candidate || candidate.length > 500 || candidate.includes("\\") ||
    !candidate.startsWith(absolutePrefix) || candidate.length <= absolutePrefix.length
  ) {
    return false;
  }
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash
    ) return false;
    return url.origin === SHARED_SUPABASE_ORIGIN &&
      url.pathname.startsWith(PUBLIC_PAYMENT_ASSET_PREFIX) &&
      url.pathname.length > PUBLIC_PAYMENT_ASSET_PREFIX.length;
  } catch {
    return false;
  }
}

function assertDinktopiaContext(context: ManagementContext): void {
  if (
    context.tenantSlug !== activeTenant.identity.slug ||
    activeTenant.identity.slug !== "dinktopia"
  ) {
    throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
  }
}

function normalizeMembershipRole(value: unknown): TenantRole | null {
  if (value === null) return null;
  if (value === "owner" || value === "admin" || value === "staff") return value;
  throw new Error("LIVE_SESSION_MEMBERSHIP_ROLE_INVALID");
}

function normalizeManagerSession(candidate: unknown): VerifiedManagerSession {
  const row = record(candidate);
  if (!row || !("membershipRole" in row)) {
    throw new Error("LIVE_MANAGER_SESSION_INVALID");
  }
  const tenantSlug = value(row, ["tenantSlug"]);
  const serverRole = value(row, ["role"]);
  const status = value(row, ["status"]);
  const email = value(row, ["email"]);
  const membershipRole = normalizeMembershipRole(row.membershipRole);
  const isSystemOwner = serverRole === "owner" && membershipRole === null;
  const isTenantManager = serverRole === "court_owner" &&
    (membershipRole === "owner" || membershipRole === "admin");
  const isTenantStaff = serverRole === "staff" && membershipRole === "staff";
  if (
    tenantSlug !== activeTenant.identity.slug || status !== "active" || !email ||
    (!isSystemOwner && !isTenantManager && !isTenantStaff)
  ) {
    throw new Error("LIVE_MANAGER_SESSION_INVALID");
  }
  return {
    role: isSystemOwner ? "owner" : membershipRole ?? "host",
    serverRole,
    membershipRole,
    isSystemOwner,
    displayName: value(row, ["fullName", "username"], email),
    email,
  };
}

function assertVenueManager(session: VerifiedManagerSession): void {
  if (
    !session.isSystemOwner && session.membershipRole !== "owner" &&
    session.membershipRole !== "admin"
  ) {
    throw new Error("SETTINGS_UPDATE_ACCESS_DENIED");
  }
}

function activationPermissionState(settings: JsonObject | null) {
  const permissions = record(settings?.permissions);
  return {
    canManageVenueSettings: permissions?.canManageVenueSettings === true,
    canManagePlatformBilling: permissions?.canManagePlatformBilling === true,
    canActivatePublicBooking: permissions?.canActivatePublicBooking === true,
  };
}

function nullableResponseText(
  row: JsonObject,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!(key in row)) return { ok: false };
  const candidate = row[key];
  if (candidate === null) return { ok: true, value: null };
  if (typeof candidate !== "string" || !candidate.trim()) return { ok: false };
  return { ok: true, value: candidate.trim() };
}

function businessPaymentConfiguration(
  settings: JsonObject | null,
): BusinessPaymentConfiguration | null {
  if (!settings) return null;
  const business = record(settings.business);
  const venue = record(settings.venue);
  const paymentMethods = settings.paymentMethods;
  if (!business || !venue || !Array.isArray(paymentMethods)) return null;
  const rootUpdatedAt = value(settings, ["updatedAt"]);
  if (!rootUpdatedAt || !Number.isFinite(new Date(rootUpdatedAt).getTime())) {
    return null;
  }

  const displayName = value(business, ["displayName"]);
  const contactPhone = nullableResponseText(business, "contactPhone");
  const facebookUrl = nullableResponseText(business, "facebookUrl");
  const tagline = nullableResponseText(business, "tagline");
  const replyToEmail = nullableResponseText(venue, "replyToEmail");
  if (
    displayName.length < 2 || displayName.length > 120 ||
    !contactPhone.ok || !facebookUrl.ok || !tagline.ok || !replyToEmail.ok ||
    typeof business.eventBookingEnabled !== "boolean" ||
    typeof venue.emailEnabled !== "boolean" ||
    typeof venue.publicBookingEnabled !== "boolean" ||
    paymentMethods.length > 10
  ) return null;

  const normalizedMethods: PaymentMethodConfiguration[] = [];
  const seenCodes = new Set<string>();
  for (const candidate of paymentMethods) {
    const method = record(candidate);
    if (!method) return null;
    const methodCode = value(method, ["methodCode"]);
    const methodDisplayName = value(method, ["displayName"]);
    const accountName = value(method, ["accountName"]);
    const accountNumber = value(method, ["accountNumber"]);
    const instructions = nullableResponseText(method, "instructions");
    const qrUrl = nullableResponseText(method, "qrUrl");
    const sortOrder = exactInteger(method, ["sortOrder"]);
    if (
      !/^[a-z][a-z0-9_-]{1,39}$/.test(methodCode) ||
      seenCodes.has(methodCode) || methodDisplayName.length < 2 ||
      accountName.length < 2 || accountNumber.length < 3 ||
      !instructions.ok || !qrUrl.ok ||
      (qrUrl.value !== null && !isAllowedCustomerQrUrl(qrUrl.value)) ||
      typeof method.isActive !== "boolean" ||
      sortOrder === null || sortOrder < 0 || sortOrder > 1_000
    ) return null;
    seenCodes.add(methodCode);
    normalizedMethods.push({
      methodCode,
      displayName: methodDisplayName,
      accountName,
      accountNumber,
      instructions: instructions.value,
      qrUrl: qrUrl.value,
      isActive: method.isActive,
      sortOrder,
    });
  }

  let platformBilling: BusinessPaymentConfiguration["platformBilling"] = null;
  if (settings.platformBilling !== null && settings.platformBilling !== undefined) {
    const billing = record(settings.platformBilling);
    const feeMode = billing ? value(billing, ["feeMode"]) : "";
    const feeAmount = billing ? numberValue(billing, ["feeAmount"]) : null;
    if (
      !billing ||
      (feeMode !== "fixed_per_booking" && feeMode !== "fixed_per_hour" &&
        feeMode !== "percentage") ||
      feeAmount === null || typeof billing.isConfigured !== "boolean"
    ) return null;
    platformBilling = { feeMode, feeAmount, isConfigured: billing.isConfigured };
  }

  const normalizedBusiness = {
      displayName,
      contactPhone: contactPhone.value,
      facebookUrl: facebookUrl.value,
      tagline: tagline.value,
      eventBookingEnabled: business.eventBookingEnabled,
  };
  const normalizedVenue = {
      replyToEmail: replyToEmail.value,
      emailEnabled: venue.emailEnabled,
      publicBookingEnabled: venue.publicBookingEnabled,
  };
  return {
    revision: rootUpdatedAt,
    business: normalizedBusiness,
    venue: normalizedVenue,
    paymentMethods: normalizedMethods,
    platformBilling,
  };
}

function liveCapabilities(options: {
  session: VerifiedManagerSession;
  canManageVenueSettings: boolean;
  canManageBlocks: boolean;
  canActivatePublicBooking: boolean;
}): ManagementCapability[] {
  const capabilities: ManagementCapability[] = ["customer:view", "report:view"];
  if (options.canManageVenueSettings) capabilities.push("settings:update");
  if (options.canManageBlocks) capabilities.push("schedule:block");
  if (options.session.isSystemOwner && options.canActivatePublicBooking) {
    capabilities.push("tenant:publish");
  }
  return capabilities;
}

function exactInteger(row: JsonObject, keys: string[]): number | null {
  const result = numberValue(row, keys);
  return result !== null && Number.isSafeInteger(result) ? result : null;
}

function returnedTwoPriceBands(candidate: unknown): SharedPriceBand[] | null {
  if (!Array.isArray(candidate) || candidate.length !== 2) return null;
  const bands: SharedPriceBand[] = [];
  for (const candidateBand of candidate) {
    const band = record(candidateBand);
    const start = band ? value(band, ["start"]) : "";
    const end = band ? value(band, ["end"]) : "";
    const hourlyRate = band ? numberValue(band, ["hourlyRate"]) : null;
    if (!band || !start || !end || hourlyRate === null) return null;
    bands.push({ start, end, hourlyRate });
  }
  return bands;
}

function scheduleForCourt(row: JsonObject) {
  const opensAt = normalizedClock(value(row, ["opens_at", "opensAt"]));
  const closesAt = normalizedClock(value(row, ["closes_at", "closesAt"]));
  const pricing = record(row.pricing_config ?? row.pricingConfig);
  const regular = record(pricing?.regular);
  if (!opensAt || !closesAt) return null;
  return normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(regular?.bands),
  });
}

function mapLiveCourt(row: JsonObject): Court {
  const id = value(row, ["id"]);
  const slug = value(row, ["slug"]);
  const name = value(row, ["name"]);
  const description = value(row, ["description"]);
  const status = value(row, ["status"]);
  const sortOrder = exactInteger(row, ["sort_order", "sortOrder"]);
  const currency = value(row, ["currency"]);
  const schedule = scheduleForCourt(row);
  if (
    !UUID_PATTERN.test(id) || !slug || !name ||
    (status !== "active" && status !== "inactive" && status !== "maintenance") ||
    sortOrder === null || currency !== activeTenant.identity.currency
  ) {
    throw new Error("LIVE_COURT_ROW_INVALID");
  }
  return {
    id,
    slug,
    name,
    description,
    surface: description || "No description configured",
    status,
    sortOrder,
    opensAt: schedule?.opensAt ?? null,
    closesAt: schedule?.closesAt ?? null,
    rateDay: schedule?.bands.length === 2
      ? schedule.bands[0]?.hourlyRate ?? null
      : null,
    ratePeak: schedule?.bands.length === 2
      ? schedule.bands[1]?.hourlyRate ?? null
      : null,
  };
}

function sharedLiveConfiguration(courtRows: JsonObject[]): Pick<
  LiveConfiguration,
  "sharedSchedule" | "scheduleIsUniform"
> {
  if (!courtRows.length) return { sharedSchedule: null, scheduleIsUniform: true };
  const schedules = courtRows.map(scheduleForCourt);
  if (schedules.some((schedule) => schedule === null)) {
    return { sharedSchedule: null, scheduleIsUniform: false };
  }
  const [first, ...rest] = schedules as NonNullable<ReturnType<typeof scheduleForCourt>>[];
  const signature = JSON.stringify(first);
  if (rest.some((schedule) => JSON.stringify(schedule) !== signature)) {
    return { sharedSchedule: null, scheduleIsUniform: false };
  }
  return { sharedSchedule: first, scheduleIsUniform: true };
}

function requiredUuid(candidate: unknown, errorCode: string): string {
  const id = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(id)) throw new Error(errorCode);
  return id;
}

function assertAllowedKeys(
  row: JsonObject,
  allowed: ReadonlySet<string>,
  errorCode: string,
): void {
  if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error(errorCode);
}

function assertNoSensitiveIdentifiers(candidate: unknown): void {
  if (!candidate || typeof candidate !== "object") return;
  if (Array.isArray(candidate)) {
    candidate.forEach(assertNoSensitiveIdentifiers);
    return;
  }
  const row = candidate as JsonObject;
  for (const [key, nested] of Object.entries(row)) {
    const normalized = key.replaceAll("_", "").toLowerCase();
    if (
      normalized === "tenantid" || normalized === "ptenantid" ||
      normalized.includes("servicerole")
    ) {
      throw new Error("LIVE_PAYLOAD_FIELD_FORBIDDEN");
    }
    assertNoSensitiveIdentifiers(nested);
  }
}

function payloadObject(candidate: unknown, errorCode: string): JsonObject {
  assertNoSensitiveIdentifiers(candidate);
  assertJsonSafe(candidate, errorCode);
  const result = record(candidate);
  if (!result) throw new Error(errorCode);
  return result;
}

function assertJsonSafe(candidate: unknown, errorCode: string): void {
  if (
    candidate === null || typeof candidate === "string" ||
    typeof candidate === "boolean"
  ) return;
  if (typeof candidate === "number") {
    if (!Number.isFinite(candidate)) throw new Error(errorCode);
    return;
  }
  if (Array.isArray(candidate)) {
    candidate.forEach((entry) => assertJsonSafe(entry, errorCode));
    return;
  }
  if (!candidate || typeof candidate !== "object") throw new Error(errorCode);
  Object.values(candidate as JsonObject).forEach((entry) => {
    if (entry === undefined) throw new Error(errorCode);
    assertJsonSafe(entry, errorCode);
  });
}

const COURT_PATCH_KEYS = new Set([
  "slug",
  "name",
  "description",
  "status",
  "sortOrder",
  "opensAt",
  "closesAt",
  "currency",
  "pricingConfig",
  "publicConfig",
]);

function courtMutationPatch(candidate: unknown, creating: boolean): JsonObject {
  const patch = payloadObject(candidate, "COURT_MUTATION_INVALID");
  assertAllowedKeys(patch, COURT_PATCH_KEYS, "COURT_MUTATION_INVALID");
  if (!Object.keys(patch).length) throw new Error("COURT_MUTATION_INVALID");
  const required = [
    "slug",
    "name",
    "status",
    "sortOrder",
    "opensAt",
    "closesAt",
    "currency",
    "pricingConfig",
    "publicConfig",
  ];
  if (creating && required.some((key) => !(key in patch))) {
    throw new Error("COURT_CONFIGURATION_INCOMPLETE");
  }
  if (
    "slug" in patch &&
    (typeof patch.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(patch.slug))
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "name" in patch &&
    (typeof patch.name !== "string" || patch.name.trim().length < 1 || patch.name.trim().length > 120)
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "description" in patch && patch.description !== null &&
    typeof patch.description !== "string"
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "status" in patch && patch.status !== "active" && patch.status !== "inactive" &&
    patch.status !== "maintenance"
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "sortOrder" in patch &&
    (!Number.isSafeInteger(patch.sortOrder) || (patch.sortOrder as number) < 0 || (patch.sortOrder as number) > 10_000)
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if ("opensAt" in patch && (typeof patch.opensAt !== "string" || !CLOCK_PATTERN.test(patch.opensAt))) {
    throw new Error("COURT_CONFIGURATION_INVALID");
  }
  if ("closesAt" in patch && (typeof patch.closesAt !== "string" || !CLOCK_PATTERN.test(patch.closesAt))) {
    throw new Error("COURT_CONFIGURATION_INVALID");
  }
  if ("currency" in patch && patch.currency !== activeTenant.identity.currency) {
    throw new Error("COURT_CURRENCY_INVALID");
  }
  if ("pricingConfig" in patch) {
    const schedule = validateCourtPricing(patch);
    const pricing = record(patch.pricingConfig)!;
    const regular = record(pricing.regular)!;
    patch.pricingConfig = {
      ...pricing,
      regular: { ...regular, bands: schedule.bands },
    };
  }
  if ("publicConfig" in patch) validateCourtPublicConfig(patch.publicConfig);
  return Object.fromEntries(Object.entries(patch).map(([key, entry]) => [
    key,
    typeof entry === "string" ? entry.trim() : entry,
  ]));
}

function validateCourtPricing(patch: JsonObject) {
  const pricing = record(patch.pricingConfig);
  const regular = record(pricing?.regular);
  const minimumHours = regular ? numberValue(regular, ["minimumHours"]) : null;
  const maximumHours = regular ? numberValue(regular, ["maximumHours"]) : null;
  const opensAt = typeof patch.opensAt === "string" ? patch.opensAt : "";
  const closesAt = typeof patch.closesAt === "string" ? patch.closesAt : "";
  const schedule = normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(regular?.bands),
  });
  if (
    !pricing || !regular || !schedule || minimumHours === null || maximumHours === null ||
    !Number.isInteger(minimumHours) || !Number.isInteger(maximumHours) ||
    minimumHours <= 0 || maximumHours < minimumHours ||
    !WHOLE_HOUR_PATTERN.test(opensAt) || !WHOLE_HOUR_PATTERN.test(closesAt)
  ) {
    throw new Error("COURT_PRICING_CONFIGURATION_INVALID");
  }
  return schedule;
}

function validateCourtPublicConfig(candidate: unknown): void {
  const publicConfig = record(candidate);
  const minimumLeadMinutes = publicConfig
    ? exactInteger(publicConfig, ["minimumLeadMinutes"])
    : null;
  const maximumAdvanceDays = publicConfig
    ? exactInteger(publicConfig, ["maximumAdvanceDays"])
    : null;
  if (
    !publicConfig || minimumLeadMinutes === null || minimumLeadMinutes < 0 ||
    maximumAdvanceDays === null || maximumAdvanceDays < 1
  ) {
    throw new Error("COURT_PUBLIC_CONFIGURATION_INVALID");
  }
}

const SHARED_SCHEDULE_KEYS = new Set(["opensAt", "closesAt", "bands"]);

function sharedSchedulePayload(candidate: unknown) {
  const payload = payloadObject(candidate, "SHARED_COURT_SCHEDULE_INVALID");
  assertAllowedKeys(payload, SHARED_SCHEDULE_KEYS, "SHARED_COURT_SCHEDULE_INVALID");
  const opensAt = typeof payload.opensAt === "string" ? payload.opensAt.trim() : "";
  const closesAt = typeof payload.closesAt === "string" ? payload.closesAt.trim() : "";
  const schedule = normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(payload.bands),
  });
  if (!schedule) {
    throw new Error("SHARED_COURT_SCHEDULE_INVALID");
  }
  return schedule;
}

const BLOCK_PAYLOAD_KEYS = new Set([
  "courtId",
  "startDate",
  "endDate",
  "startsAt",
  "endsAt",
  "publicLabel",
  "internalReason",
]);

function blockedDatePayload(candidate: unknown) {
  const payload = payloadObject(candidate, "BLOCK_CONFIGURATION_INVALID");
  assertAllowedKeys(payload, BLOCK_PAYLOAD_KEYS, "BLOCK_CONFIGURATION_INVALID");
  const startDate = typeof payload.startDate === "string" ? payload.startDate.trim() : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate.trim() : startDate;
  const publicLabel = typeof payload.publicLabel === "string" ? payload.publicLabel.trim() : "";
  const internalReason = typeof payload.internalReason === "string"
    ? payload.internalReason.trim()
    : null;
  const startsAt = typeof payload.startsAt === "string" ? payload.startsAt.trim() : null;
  const endsAt = typeof payload.endsAt === "string" ? payload.endsAt.trim() : null;
  if (
    !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) ||
    !BLOCK_LABELS.has(publicLabel as "Reserved") ||
    (internalReason !== null && internalReason.length > 200) ||
    ((startsAt === null) !== (endsAt === null)) ||
    (startsAt !== null && (!WHOLE_HOUR_PATTERN.test(startsAt) || !WHOLE_HOUR_PATTERN.test(endsAt ?? "") || endsAt! <= startsAt))
  ) {
    throw new Error("BLOCK_CONFIGURATION_INVALID");
  }
  return {
    courtId: payload.courtId === null || payload.courtId === undefined
      ? null
      : requiredUuid(payload.courtId, "COURT_ID_INVALID"),
    startDate,
    endDate,
    startsAt,
    endsAt,
    publicLabel: publicLabel as "Reserved" | "Private Event" | "Maintenance" | "Closed",
    internalReason,
  };
}

const BUSINESS_PATCH_KEYS = new Set([
  "displayName",
  "contactPhone",
  "facebookUrl",
  "tagline",
  "eventBookingEnabled",
  "branding",
  "venue",
  "paymentMethods",
]);
const ACTIVATION_PATCH_KEYS = new Set([
  "platformBilling",
  "openPlayServiceFee",
  "venue",
  "paymentMethods",
]);
const BUSINESS_ACTION_KEYS = new Set([
  ...BUSINESS_PATCH_KEYS,
  "expectedRevision",
]);
const ISO_REVISION_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function assertSafePaymentQrUrls(payload: JsonObject): void {
  if (!("paymentMethods" in payload)) return;
  if (!Array.isArray(payload.paymentMethods)) {
    throw new Error("PAYMENT_METHODS_INVALID");
  }
  for (const candidate of payload.paymentMethods) {
    const method = record(candidate);
    if (!method) throw new Error("PAYMENT_METHODS_INVALID");
    const qrUrl = method.qrUrl;
    if (qrUrl === undefined || qrUrl === null || qrUrl === "") continue;
    if (typeof qrUrl !== "string" || !isAllowedCustomerQrUrl(qrUrl.trim())) {
      throw new Error("PAYMENT_QR_URL_NOT_ALLOWED");
    }
  }
}

function settingsPatch(candidate: unknown, action: "business:update" | "activation:update") {
  const payload = payloadObject(candidate, "SETTINGS_PATCH_INVALID");
  assertAllowedKeys(
    payload,
    action === "business:update" ? BUSINESS_PATCH_KEYS : ACTIVATION_PATCH_KEYS,
    "SETTINGS_PATCH_INVALID",
  );
  if (!Object.keys(payload).length) throw new Error("SETTINGS_PATCH_INVALID");
  const venue = "venue" in payload ? record(payload.venue) : null;
  if (venue && "publicBookingEnabled" in venue) {
    throw new Error("USE_INITIAL_ACTIVATION_ACTION");
  }
  assertSafePaymentQrUrls(payload);
  return payload;
}

function businessActionPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "SETTINGS_PATCH_INVALID");
  assertAllowedKeys(payload, BUSINESS_ACTION_KEYS, "SETTINGS_PATCH_INVALID");
  const expectedRevision = typeof payload.expectedRevision === "string"
    ? payload.expectedRevision.trim()
    : "";
  if (
    !ISO_REVISION_PATTERN.test(expectedRevision) ||
    !Number.isFinite(new Date(expectedRevision).getTime())
  ) throw new Error("SETTINGS_REVISION_REQUIRED");
  const patch = { ...payload };
  delete patch.expectedRevision;
  return {
    expectedRevision,
    patch: settingsPatch(patch, "business:update"),
  };
}

function assertNoPayload(candidate: unknown): void {
  if (candidate !== undefined) throw new Error("LIVE_ACTION_PAYLOAD_UNEXPECTED");
}

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

function courtLabel(
  courtId: string,
  courtNames: ReadonlyMap<string, string>,
  allCourtsLabel = "Court unavailable",
): string {
  if (!courtId) return allCourtsLabel;
  return courtNames.get(courtId) ?? "Court unavailable";
}

function livePaymentStatus(candidate: string): BookingPaymentStatus {
  if (
    candidate === "unpaid" || candidate === "pending" ||
    candidate === "partial" || candidate === "paid" ||
    candidate === "refunded" || candidate === "rejected"
  ) return candidate;
  return "unknown";
}

function mapLiveBooking(
  row: JsonObject,
  courtNames: ReadonlyMap<string, string>,
): Booking {
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
    court: value(
      row,
      ["court_name", "courtName"],
      courtLabel(courtId, courtNames),
    ),
    date: bookingDateLabel(row, startsAt),
    time: bookingTimeLabel(startsAt, endsAt),
    duration: durationLabel(startsAt, endsAt),
    amount: bookingAmount(row),
    status: liveStatus(row),
    payment: livePaymentStatus(paymentStatus),
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

function mapLiveBlock(
  row: JsonObject,
  courtNames: ReadonlyMap<string, string>,
): CourtBlock {
  const id = value(row, ["id"]);
  const blockedOn = value(row, ["blocked_on"]);
  if (!id || !blockedOn) throw new Error("LIVE_BLOCK_ROW_INVALID");
  const startRaw = value(row, ["starts_at"]);
  const endRaw = value(row, ["ends_at"]);
  const start = localBlockInstant(blockedOn, startRaw);
  const end = localBlockInstant(blockedOn, endRaw);
  const date = localCalendarDate(blockedOn);
  const courtId = value(row, ["court_id"]);
  const publicLabel = value(row, ["public_label", "reason"], "Court unavailable");
  const internalReason = value(row, ["internal_reason"]);
  return {
    id,
    court: courtLabel(courtId, courtNames, "All courts"),
    date: date ? formatManilaDate(date) : "Date unavailable",
    dateValue: DATE_PATTERN.test(blockedOn) ? blockedOn : null,
    time: start && end
      ? `${formatManilaTime(start)}–${formatManilaTime(end)}`
      : "All day",
    reason: publicLabel,
    publicLabel,
    internalReason: internalReason || null,
    createdBy: null,
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
      detail: "Activation settings were not available for this load; refresh before drawing a permission conclusion.",
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
  courtNames: ReadonlyMap<string, string>,
): ScheduleSlot[] {
  const bookingSlots = bookingRows.map((row) => {
    const booking = mapLiveBooking(row, courtNames);
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
    const block = mapLiveBlock(row, courtNames);
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
