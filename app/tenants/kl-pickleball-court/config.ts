import type { TenantConfig } from "../types";

export type KlPickleballCourtTenantConfig = TenantConfig<"kl-pickleball-court">;

/**
 * K&L's tenant-owned configuration boundary.
 *
 * Operational details deliberately remain null until they are entered and
 * approved through the shared management system. The brand direction and
 * palette establish a K&L-owned starting point while the temporary wordmark
 * awaits an approved logo asset.
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
    direction: "Warm neighborhood court culture with an energetic, welcoming local-club feel",
    tagline: "Your local court. Your next rally.",
    primary: "#183A32",
    paper: "#FFF8EA",
    electric: "#2F6F62",
    citrus: "#D8E86B",
    coral: "#E36B4F",
    logo: {
      kind: "wordmark",
      label: "K&L Pickleball Court",
      temporary: true,
    },
    socialImagePath: "/og.png",
  },
  previewCourts: [],
} as const satisfies KlPickleballCourtTenantConfig;
