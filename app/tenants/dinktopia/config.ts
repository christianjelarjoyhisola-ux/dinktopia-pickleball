import type { TenantConfig, TenantCourtPreview } from "../types";

export type DinktopiaCourtPreview = TenantCourtPreview;
export type DinktopiaTenantConfig = TenantConfig<"dinktopia">;

/**
 * Dinktopia's only tenant-owned configuration boundary.
 *
 * Operational values are deliberately provisional. They power the local and
 * private sales preview only and must never be treated as production facts.
 * The shared platform remains authoritative whenever live configuration is
 * available.
 */
export const dinktopiaConfig = {
  identity: {
    name: "Dinktopia Pickleball",
    shortName: "Dinktopia",
    slug: "dinktopia",
    locale: "en-PH",
    currency: "PHP",
    timezone: "Asia/Manila",
    productionDomain: "dinktopia.pages.dev",
  },
  activation: {
    status: "setup_required",
    publicBookingEnabled: false,
    provisional: true,
  },
  venue: {
    locationLabel: "Philippines · exact venue coming soon",
    address: null,
    mapsUrl: null,
    opensAt: "06:00",
    closesAt: "22:00",
  },
  booking: {
    minimumHours: 1,
    maximumHours: 3,
    minimumLeadMinutes: 60,
    maximumAdvanceDays: 30,
    slotMinutes: 60,
    holdMinutes: 10,
    offPeakEndsAt: "16:00",
    offPeakHourlyRate: 300,
    peakHourlyRate: 400,
    paymentFlow: "manual-full-payment-receipt",
    cancellation:
      "Unpaid holds can be cancelled online. Paid-booking changes are handled by the venue team until the owner publishes a final refund policy.",
    rescheduling:
      "Confirmed bookings are rescheduled by an owner or administrator using the platform's atomic rescheduling flow.",
  },
  brand: {
    direction: "Modern court club led by the official Dinktopia mark",
    tagline: "Find your hour. Own the rally.",
    primary: "#102A43",
    paper: "#F4F7FA",
    electric: "#254C84",
    citrus: "#82F500",
    coral: "#C13E2B",
    logo: {
      kind: "image",
      src: "/dinktopia-logo.png",
      alt: "Dinktopia Pickleball",
      temporary: false,
    },
    socialImagePath: "/og.png",
  },
  previewCourts: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      slug: "preview-court-01",
      name: "Court 01",
      surface: "Competition surface",
      environment: "Preview configuration",
      description: "A bright, fast court prepared for social games and focused drills.",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      slug: "preview-court-02",
      name: "Court 02",
      surface: "Competition surface",
      environment: "Preview configuration",
      description: "A flexible court for doubles sessions, coaching, and club play.",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      slug: "preview-court-03",
      name: "Court 03",
      surface: "Competition surface",
      environment: "Preview configuration",
      description: "A lively court for group bookings, evening rallies, and team play.",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      slug: "preview-court-04",
      name: "Court 04",
      surface: "Competition surface",
      environment: "Preview configuration",
      description: "A welcoming court for first games, friendly matches, and club events.",
    },
  ],
} as const satisfies DinktopiaTenantConfig;
