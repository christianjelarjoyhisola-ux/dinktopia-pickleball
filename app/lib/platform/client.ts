"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { activeTenant } from "../../tenants/registry";
import type {
  AvailabilityResponse,
  BookingConfirmation,
  CreateBookingInput,
  PlatformErrorBody,
  PlatformMode,
  TenantBootstrap,
} from "./types";

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const SHARED_SUPABASE_ORIGIN = "https://neqvrwtofiolcuxewdze.supabase.co";

let browserClient: SupabaseClient | null = null;

export class PlatformRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlatformRequestError";
  }
}

function jwtRole(value: string): string | null {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const normalized = segments[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).role === "string"
      ? (payload as Record<string, string>).role
      : null;
  } catch {
    return null;
  }
}

function validBrowserPlatformConfiguration(): boolean {
  let url: URL;
  try {
    url = new URL(publicSupabaseUrl);
  } catch {
    return false;
  }
  const publishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicSupabaseKey) ||
    jwtRole(publicSupabaseKey) === "anon";
  return Boolean(
    publishableKey && url.origin === SHARED_SUPABASE_ORIGIN &&
    url.protocol === "https:" && !url.username && !url.password &&
    (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash,
  );
}

export function platformMode(): PlatformMode {
  return validBrowserPlatformConfiguration() ? "live" : "preview";
}

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

function currentHostname(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname.toLowerCase();
}

function edgeUrl(functionName: string): string {
  return `${publicSupabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}?tenantSlug=${activeTenant.identity.slug}`;
}

function publicHeaders(accessToken?: string): HeadersInit {
  return {
    apikey: publicSupabaseKey,
    Authorization: `Bearer ${accessToken || publicSupabaseKey}`,
    "Content-Type": "application/json",
    "X-Tenant-Slug": activeTenant.identity.slug,
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as PlatformErrorBody & T;
  if (!response.ok) {
    const nested = body.error;
    throw new PlatformRequestError(
      response.status,
      nested?.code || body.code || "PLATFORM_REQUEST_FAILED",
      nested?.message || body.message || "The platform request could not be completed.",
    );
  }
  return body as T;
}

async function rpc<T>(
  functionName: string,
  args: Record<string, unknown>,
  accessToken?: string,
) {
  const response = await fetch(
    `${publicSupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: publicHeaders(accessToken),
      body: JSON.stringify(args),
      cache: "no-store",
    },
  );
  return responseJson<T>(response);
}

const REGISTERED_MANAGEMENT_ORIGIN = "https://dinktopia.pages.dev";

function managementHostname(options: { mutation?: boolean } = {}): string {
  if (typeof window === "undefined") {
    throw new PlatformRequestError(
      403,
      "LIVE_TENANT_ORIGIN_MISMATCH",
      "Live tenant management requires the registered Dinktopia origin.",
    );
  }
  const origin = window.location.origin.toLowerCase();
  if (options.mutation && origin !== REGISTERED_MANAGEMENT_ORIGIN) {
    throw new PlatformRequestError(
      403,
      "LIVE_TENANT_ORIGIN_MISMATCH",
      "Live changes are accepted only from the registered Dinktopia origin.",
    );
  }
  return window.location.hostname.toLowerCase();
}

function previewBootstrap(): TenantBootstrap {
  const tenant = activeTenant;
  return {
    tenant: {
      slug: tenant.identity.slug,
      name: tenant.identity.name,
      timezone: tenant.identity.timezone,
      branding: { ...tenant.brand },
      publicConfig: {
        publicBookingEnabled: false,
        provisional: true,
        tagline: tenant.brand.tagline,
      },
    },
    courts: tenant.previewCourts.map((court) => ({
      ...court,
      opensAt: tenant.venue.opensAt,
      closesAt: tenant.venue.closesAt,
      currency: tenant.identity.currency,
      pricingConfig: {
        regular: {
          minimumHours: tenant.booking.minimumHours,
          maximumHours: tenant.booking.maximumHours,
          bands: [
            {
              start: tenant.venue.opensAt,
              end: tenant.booking.offPeakEndsAt,
              hourlyRate: tenant.booking.offPeakHourlyRate,
            },
            {
              start: tenant.booking.offPeakEndsAt,
              end: tenant.venue.closesAt,
              hourlyRate: tenant.booking.peakHourlyRate,
            },
          ],
        },
      },
      publicConfig: {
        minimumLeadMinutes: tenant.booking.minimumLeadMinutes,
        maximumAdvanceDays: tenant.booking.maximumAdvanceDays,
      },
    })),
    paymentMethods: [],
    settings: {},
    readiness: {
      publicBookingEnabled: false,
      setupActive: false,
      domainConfigured: false,
      courtPricingConfigured: false,
      billingConfigured: false,
      paymentConfigured: false,
      remittanceConfigured: false,
      emailConfigured: false,
      blockingReasons: [
        "TENANT_SETUP_REQUIRED",
        "ACTIVE_DOMAIN_MISSING",
        "PAYMENT_METHOD_MISSING",
      ],
    },
    refundReschedulePolicy: null,
  };
}

export async function getTenantBootstrap(): Promise<TenantBootstrap> {
  if (platformMode() === "preview") return previewBootstrap();
  const result = await rpc<TenantBootstrap | null>("get_public_tenant_bootstrap", {
    p_tenant_slug: activeTenant.identity.slug,
    p_hostname: currentHostname(),
  });
  if (!result) {
    throw new PlatformRequestError(
      404,
      "TENANT_ORIGIN_NOT_REGISTERED",
      "This Dinktopia hostname is not registered with the booking platform.",
    );
  }
  return result;
}

export async function getAvailability(date: string): Promise<AvailabilityResponse> {
  if (platformMode() === "preview") {
    return {
      date,
      timezone: activeTenant.identity.timezone,
      courts: activeTenant.previewCourts.map((court, index) => ({
        id: court.id,
        slug: court.slug,
        name: court.name,
        unavailable: index === 0
          ? [
              { startsAt: `${date}T09:00:00`, endsAt: `${date}T10:00:00` },
              { startsAt: `${date}T18:00:00`, endsAt: `${date}T20:00:00` },
            ]
          : [{ startsAt: `${date}T16:00:00`, endsAt: `${date}T17:00:00` }],
      })),
    };
  }
  const result = await rpc<AvailabilityResponse | null>("get_public_availability", {
    p_tenant_slug: activeTenant.identity.slug,
    p_hostname: currentHostname(),
    p_date: date,
  });
  if (!result) {
    throw new PlatformRequestError(404, "AVAILABILITY_NOT_FOUND", "Availability is unavailable.");
  }
  return result;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingConfirmation> {
  const clientRequestId = input.clientRequestId || crypto.randomUUID();
  if (platformMode() === "preview") {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const startHour = Number(input.startTime.slice(0, 2));
    const hourlyRate = startHour < 16
      ? activeTenant.booking.offPeakHourlyRate
      : activeTenant.booking.peakHourlyRate;
    const subtotal = hourlyRate * input.durationHours;
    return {
      reference: `DINK-${clientRequestId.slice(0, 8).toUpperCase()}`,
      status: "preview_only",
      expiresAt: null,
      courtName:
        activeTenant.previewCourts.find((court) => court.id === input.courtId)?.name ||
        "Dinktopia court",
      bookingType: input.bookingType || "regular",
      startsAt: `${input.bookingDate}T${input.startTime}:00+08:00`,
      endsAt: `${input.bookingDate}T${String(startHour + input.durationHours).padStart(2, "0")}:00:00+08:00`,
      subtotalAmount: subtotal,
      serviceFeeAmount: 0,
      totalAmount: subtotal,
      currency: activeTenant.identity.currency,
      fullPaymentOnly: true,
      bookingToken: clientRequestId,
      preview: true,
    };
  }
  if (!input.turnstileToken) {
    throw new PlatformRequestError(
      400,
      "TURNSTILE_REQUIRED",
      "Complete the security check before booking.",
    );
  }
  const response = await fetch(edgeUrl("create-booking"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      courtId: input.courtId,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      durationHours: input.durationHours,
      bookingType: input.bookingType || "regular",
      customer: input.customer,
      guestCount: input.guestCount || 1,
      equipmentRental: input.equipmentRental || { extraPaddles: 0, balls: 0 },
      notes: input.notes || null,
      clientRequestId,
      policyAccepted: input.policyAccepted === true,
      policyVersion: input.policyVersion || null,
      turnstileToken: input.turnstileToken,
    }),
  });
  const result = await responseJson<{ ok: true; booking: BookingConfirmation }>(response);
  return result.booking;
}

export async function bookingStatus(reference: string, token: string) {
  if (platformMode() === "preview") {
    return { ok: true, booking: { reference, status: "preview_only", paymentStatus: "unpaid" } };
  }
  const response = await fetch(edgeUrl("booking-status"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      bookingReference: reference,
      bookingToken: token,
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}

export async function cancelUnpaidBooking(reference: string, token: string) {
  if (platformMode() === "preview") {
    return { ok: true, booking: { reference, status: "cancelled", preview: true } };
  }
  const response = await fetch(edgeUrl("cancel-booking"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      bookingReference: reference,
      bookingToken: token,
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}

export async function submitPaymentReceipt(options: {
  reference: string;
  token: string;
  method: string;
  paymentReference?: string;
  file: File;
}) {
  if (platformMode() === "preview") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { ok: true, outcome: "manual_review", preview: true };
  }
  const form = new FormData();
  form.append("receiptFile", options.file);
  const response = await fetch(edgeUrl("submit-payment-receipt"), {
    method: "POST",
    headers: {
      apikey: publicSupabaseKey,
      Authorization: `Bearer ${publicSupabaseKey}`,
      "X-Tenant-Slug": activeTenant.identity.slug,
      "X-Booking-Reference": options.reference,
      "X-Booking-Token": options.token,
      "X-Payment-Method": options.method,
      ...(options.paymentReference
        ? { "X-Payment-Reference": options.paymentReference }
        : {}),
    },
    body: form,
  });
  return responseJson<Record<string, unknown>>(response);
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (platformMode() !== "live") {
    throw new PlatformRequestError(
      503,
      "LIVE_CONFIGURATION_REQUIRED",
      "Connect the shared platform before signing in.",
    );
  }
  browserClient ??= createClient(publicSupabaseUrl, publicSupabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "X-Tenant-Slug": activeTenant.identity.slug } },
  });
  return browserClient;
}

export async function signInOwner(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new PlatformRequestError(401, "SIGN_IN_FAILED", "Email or password was not accepted.");
  }
  return data.session;
}

export async function currentOwnerSession(): Promise<Session | null> {
  if (platformMode() !== "live") return null;
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session;
}

export async function signOutOwner(): Promise<void> {
  if (platformMode() !== "live") return;
  await getSupabaseBrowserClient().auth.signOut();
}

async function authenticatedFunction<T>(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(edgeUrl(functionName), {
    method: "POST",
    headers: publicHeaders(accessToken),
    body: JSON.stringify({ ...body, tenantSlug: activeTenant.identity.slug }),
  });
  return responseJson<T>(response);
}

export async function listManagerBookings(
  accessToken: string,
  filters: Record<string, unknown> = {},
) {
  return authenticatedFunction<{ ok: true; bookings: Array<Record<string, unknown>> }>(
    "tenant-manager-data",
    accessToken,
    { action: "list-bookings", filters },
  );
}

export async function listManagerBlocks(
  accessToken: string,
  filters: Record<string, unknown> = {},
) {
  return authenticatedFunction<{ ok: true; blockedDates: Array<Record<string, unknown>> }>(
    "tenant-manager-data",
    accessToken,
    { action: "list-blocked-dates", filters },
  );
}

export type ManualBookingInput = {
  courtId: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
  customer: { name: string; email?: string; phone: string };
  payment: { method: string; reference?: string | null };
  clientRequestId: string;
};

export async function createManualBooking(
  accessToken: string,
  input: ManualBookingInput,
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "create-manual-booking",
    accessToken,
    input,
  );
}

export type BookingReschedulePreview = {
  ok: true;
  booking: {
    id: string;
    reference: string;
    courtId: string;
    courtName: string;
    startsAt: string;
    endsAt: string;
    localBookingDate: string;
    durationHours: number;
    status: string;
    paymentStatus: string;
    customerName: string;
    customerEmail: string | null;
    subtotalAmount: number;
    serviceFeeAmount: number;
    totalAmount: number;
    currency: string;
  };
  options: Array<{
    startsAt: string;
    endsAt: string;
    startTime: string;
    endTime: string;
    label: string;
    available: boolean;
    unavailableReason: string | null;
    courtSubtotalAmount: number;
    newSubtotalAmount: number;
    newTotalAmount: number;
    originalTotalAmount: number;
    amountPaid: number;
    additionalAmount: number;
    paymentRequired: boolean;
  }>;
  policies: {
    sameCourtOnly: true;
    sameDurationOnly: true;
    amountPolicy: "preserve_original";
    reasonCodes: Array<{ value: string; label: string }>;
    notificationDefault: true;
    notificationAvailable: boolean;
  };
};

export async function previewBookingReschedule(
  accessToken: string,
  bookingReference: string,
  bookingDate: string,
) {
  return authenticatedFunction<BookingReschedulePreview>(
    "reschedule-booking",
    accessToken,
    { action: "preview", bookingReference, bookingDate },
  );
}

export async function rescheduleBooking(
  accessToken: string,
  input: {
    bookingReference: string;
    newDate: string;
    newStartTime: string;
    reasonCode: string;
    publicReason: string;
    internalNote?: string | null;
    notifyCustomer: boolean;
    idempotencyKey: string;
  },
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "reschedule-booking",
    accessToken,
    { action: "reschedule", ...input },
  );
}

export async function cancelTenantBooking(
  accessToken: string,
  bookingId: string,
  reason: string,
) {
  managementHostname({ mutation: true });
  return rpc<Record<string, unknown>>(
    "cancel_tenant_booking",
    { p_booking_id: bookingId, p_reason: reason },
    accessToken,
  );
}

export async function checkInTenantBooking(
  accessToken: string,
  bookingId: string,
) {
  return rpc<Record<string, unknown>>(
    "check_in_tenant_booking",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_booking_id: bookingId,
    },
    accessToken,
  );
}

export async function getActivationSettings(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "get" },
  );
}

export async function updateActivationSettings(
  accessToken: string,
  patch: Record<string, unknown>,
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "update", patch },
  );
}

export type TenantPolicyDraft = {
  title: string;
  intro: string;
  content: string;
};

export async function getTenantPolicy(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "getPolicy" },
  );
}

export async function saveTenantPolicy(
  accessToken: string,
  options: {
    publish: boolean;
    expectedRevision: string | null;
    policy: TenantPolicyDraft;
  },
) {
  managementHostname({ mutation: true });
  try {
    return await authenticatedFunction<Record<string, unknown>>(
      "tenant-activation-settings",
      accessToken,
      {
        action: options.publish ? "publishPolicy" : "updatePolicy",
        expectedRevision: options.expectedRevision,
        policy: options.policy,
      },
    );
  } catch (error) {
    if (
      error instanceof PlatformRequestError &&
      (error.code === "POLICY_REVISION_STALE" || error.status === 409)
    ) {
      throw new PlatformRequestError(
        409,
        "POLICY_STALE_REFRESH_REQUIRED",
        "These rules changed in another session. Refresh before saving or publishing.",
      );
    }
    throw error;
  }
}

export async function getRemittanceDestination(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-remittance-asset",
    accessToken,
    { action: "get-destination" },
  );
}

export async function saveRemittanceDestination(
  accessToken: string,
  input: {
    method: string;
    accountName: string;
    accountReference: string;
    dueDay: number;
    instructions?: string | null;
    qrDataUrl?: string | null;
    removeQr?: boolean;
  },
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-remittance-asset",
    accessToken,
    { action: "save-destination", ...input },
  );
}

export async function getManagerSession(accessToken: string) {
  return rpc<Record<string, unknown> | null>(
    "get_my_tenant_session",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getManagerCourts(accessToken: string) {
  return rpc<Array<Record<string, unknown>>>(
    "get_tenant_courts_for_manager",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getBlockedDateAccess(accessToken: string) {
  return rpc<Record<string, unknown>>(
    "get_blocked_date_access",
    { p_tenant_slug: activeTenant.identity.slug },
    accessToken,
  );
}

export async function manageTenantCourt(
  accessToken: string,
  options: {
    action: "save" | "delete";
    courtId?: string | null;
    patch?: Record<string, unknown>;
  },
) {
  return rpc<Record<string, unknown>>(
    "manage_tenant_court",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_action: options.action,
      p_court_id: options.courtId ?? null,
      p_patch: options.patch ?? {},
    },
    accessToken,
  );
}

export async function applySharedCourtSchedule(
  accessToken: string,
  schedule: {
    opensAt: string;
    closesAt: string;
    bands: Array<{ start: string; end: string; hourlyRate: number }>;
  },
) {
  return rpc<Record<string, unknown>>(
    "apply_shared_tenant_court_schedule",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_opens_at: schedule.opensAt,
      p_closes_at: schedule.closesAt,
      p_bands: schedule.bands,
    },
    accessToken,
  );
}

export async function manageBlockedDates(
  accessToken: string,
  options: {
    action: "create" | "delete";
    blockId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    courtId?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    publicLabel?: "Reserved" | "Private Event" | "Maintenance" | "Closed";
    internalReason?: string | null;
  },
) {
  managementHostname({ mutation: true });
  return rpc<Record<string, unknown>>(
    "manage_blocked_dates",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_action: options.action,
      p_block_id: options.blockId ?? null,
      p_start_date: options.startDate ?? null,
      p_end_date: options.endDate ?? null,
      p_court_id: options.courtId ?? null,
      p_starts_at: options.startsAt ?? null,
      p_ends_at: options.endsAt ?? null,
      p_public_label: options.publicLabel ?? "Reserved",
      p_internal_reason: options.internalReason ?? null,
    },
    accessToken,
  );
}

export async function updateBusinessSettings(
  accessToken: string,
  expectedRevision: string,
  patch: Record<string, unknown>,
) {
  try {
    return await rpc<Record<string, unknown>>(
      "update_tenant_business_settings_if_current",
      {
        p_tenant_slug: activeTenant.identity.slug,
        p_hostname: managementHostname({ mutation: true }),
        p_expected_revision: expectedRevision,
        p_patch: patch,
      },
      accessToken,
    );
  } catch (error) {
    if (
      error instanceof PlatformRequestError &&
      (error.code === "40001" || error.message.includes("BUSINESS_SETTINGS_STALE"))
    ) {
      throw new PlatformRequestError(
        409,
        "SETTINGS_STALE_REFRESH_REQUIRED",
        "Business or payment settings changed in another session. Refresh before saving again.",
      );
    }
    throw error;
  }
}

export async function activateTenantInitially(accessToken: string) {
  return rpc<Record<string, unknown>>(
    "activate_tenant_initially",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
    },
    accessToken,
  );
}
