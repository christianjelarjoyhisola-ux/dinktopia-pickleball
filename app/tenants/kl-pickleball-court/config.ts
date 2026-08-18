import type { TenantConfig } from "../types";

export type KlPickleballCourtTenantConfig = TenantConfig<"kl-pickleball-court">;

/**
 * K&L's tenant-owned configuration boundary.
 *
 * Operational details deliberately remain null until they are entered and
 * approved through the shared management system. The brand direction and
 * palette are derived from the approved K&L court badge supplied by the owner.
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
    status: "active",
    publicBookingEnabled: true,
    provisional: false,
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
    direction: "Energetic neighborhood court culture led by the official blue, lime, coral, and cream badge",
    tagline: "Your local court. Your next rally.",
    primary: "#113F7D",
    paper: "#FFF8E7",
    electric: "#2B62A6",
    citrus: "#BFFF68",
    coral: "#F65355",
    logo: {
      kind: "image",
      src: "/kllogo.jpg",
      alt: "K&L Pickleball Courts",
      temporary: false,
    },
    socialImagePath: "/og.webp",
  },
  previewCourts: [],
} as const satisfies KlPickleballCourtTenantConfig;
