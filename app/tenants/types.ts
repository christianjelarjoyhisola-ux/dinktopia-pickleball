export type TenantActivationStatus = "setup_required" | "active" | "suspended" | "archived";

export type TenantCourtPreview = {
  id: string;
  slug: string;
  name: string;
  surface: string;
  environment: string;
  description: string;
};

export type TenantLogo =
  | { kind: "image"; src: string; alt: string; temporary: false }
  | { kind: "wordmark"; label: string; temporary: true };

/**
 * Tenant-owned presentation and provisional setup values.
 *
 * Nullable operational fields are intentional: the shared management system
 * is authoritative, and a tenant awaiting setup must not need fabricated
 * courts, hours, rates, policies, payment details, or domains to render.
 */
export type TenantConfig<Slug extends string = string> = {
  identity: {
    name: string;
    shortName: string;
    slug: Slug;
    locale: string;
    currency: string;
    timezone: string;
    productionDomain: string | null;
  };
  activation: {
    status: TenantActivationStatus;
    publicBookingEnabled: boolean;
    provisional: boolean;
  };
  venue: {
    locationLabel: string | null;
    address: string | null;
    mapsUrl: string | null;
    opensAt: string | null;
    closesAt: string | null;
  };
  booking: {
    minimumHours: number | null;
    maximumHours: number | null;
    minimumLeadMinutes: number | null;
    maximumAdvanceDays: number | null;
    slotMinutes: number | null;
    holdMinutes: number | null;
    offPeakEndsAt: string | null;
    offPeakHourlyRate: number | null;
    peakHourlyRate: number | null;
    paymentFlow: "manual-full-payment-receipt" | null;
    cancellation: string | null;
    rescheduling: string | null;
  };
  brand: {
    direction: string | null;
    tagline: string | null;
    primary: string;
    paper: string;
    electric: string;
    citrus: string;
    coral: string;
    logo: TenantLogo;
    socialImagePath: string | null;
  };
  previewCourts: readonly TenantCourtPreview[];
};
