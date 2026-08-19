import type { TenantConfig } from "../types";

export type KlPickleballCourtTenantConfig = TenantConfig<"kl-pickleball-court">;

/**
 * K&L's tenant-owned configuration boundary.
 *
 * Booking operations remain nullable until they are entered and approved
 * through the shared management system. The venue location comes from the
 * owner-provided Google Maps listing, and the palette comes from the approved
 * K&L court badge.
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
    locationLabel: "5H57+77, Tubay, Agusan del Norte",
    address: "5H57+77, Tubay, Agusan del Norte, Philippines",
    mapsUrl: "https://www.google.com/maps/place/K%26L+Pickleball+Court/@9.1453667,125.5226545,12.78z/data=!4m6!3m5!1s0x3301a3001cef8a35:0x40327b700f960643!8m2!3d9.1577431!4d125.5637179!16s%2Fg%2F11n9spx3ft?entry=ttu",
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
  socialLinks: {
    facebook: "https://www.facebook.com/profile.php?id=61583037885610",
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
