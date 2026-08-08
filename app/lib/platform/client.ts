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

export function platformMode(): PlatformMode {
  return publicSupabaseUrl && publicSupabaseKey ? "live" : "preview";
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

async function rpc<T>(functionName: string, args: Record<string, unknown>) {
  const response = await fetch(
    `${publicSupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify(args),
      cache: "no-store",
    },
  );
  return responseJson<T>(response);
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
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "update", patch },
  );
}
