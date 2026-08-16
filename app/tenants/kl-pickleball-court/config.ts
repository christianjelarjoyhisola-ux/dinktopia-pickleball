import type { TenantConfig } from "../types";

export type KlPickleballCourtTenantConfig = TenantConfig<"kl-pickleball-court">;

/**
 * K&L's tenant-owned configuration boundary.
 *
 * Operational details deliberately remain null until they are entered and
 * approved through the shared management system. The color tokens retain the
 * existing application design; they are not asserted as official K&L assets.
 */
export const klPickleballCourtConfig = {
  identity: {
    name: "K&L Pickleball Court",
    shortName: "K&L",
    slug: "kl-pickleball-court",
    locale: "en-PH",
    currency: "PHP",
    timezone: "Asia/Manila",
    productionDomain: "klpickleball.pages.dev",
  },
  activation: {
    status: "setup_required",
    publicBookingEnabled: false,
    provisional: true,
  },
  venue: {
    locationLabel: null,
    address: null,
    opensAt: null,
    closesAt: null,
  },
  booking: {
    minimumHours: null,
    maximumHours: null,
    minimumLeadMinutes: null,
    maximumAdvanceDays: null,
    slotMinutes: null,
    holdMinutes: null,
    offPeakEndsAt: null,
    offPeakHourlyRate: null,
    peakHourlyRate: null,
    paymentFlow: null,
    cancellation: null,
    rescheduling: null,
  },
  brand: {
    direction: null,
    tagline: null,
    primary: "#102A43",
    paper: "#F4F7FA",
    electric: "#254C84",
    citrus: "#82F500",
    coral: "#C13E2B",
    logo: {
      kind: "wordmark",
      label: "K&L Pickleball Court",
      temporary: true,
    },
    socialImagePath: null,
  },
  previewCourts: [],
} as const satisfies KlPickleballCourtTenantConfig;
