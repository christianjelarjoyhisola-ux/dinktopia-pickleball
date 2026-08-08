export type DinktopiaCourtPreview = {
  id: string;
  slug: string;
  name: string;
  surface: string;
  environment: string;
  description: string;
};

export type DinktopiaTenantConfig = {
  identity: {
    name: string;
    shortName: string;
    slug: "dinktopia";
    locale: "en-PH";
    currency: "PHP";
    timezone: "Asia/Manila";
    productionDomain: null;
  };
  activation: {
    status: "setup_required";
    publicBookingEnabled: false;
    provisional: true;
  };
  venue: {
    locationLabel: string;
    address: null;
    opensAt: string;
    closesAt: string;
  };
  booking: {
    minimumHours: number;
    maximumHours: number;
    minimumLeadMinutes: number;
    maximumAdvanceDays: number;
    slotMinutes: 60;
    holdMinutes: number;
    offPeakEndsAt: string;
    offPeakHourlyRate: number;
    peakHourlyRate: number;
    paymentFlow: "manual-full-payment-receipt";
    cancellation: string;
    rescheduling: string;
  };
  brand: {
    direction: string;
    tagline: string;
    primary: string;
    paper: string;
    electric: string;
    citrus: string;
    coral: string;
  };
  previewCourts: readonly DinktopiaCourtPreview[];
};

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
    productionDomain: null,
  },
  activation: {
    status: "setup_required",
    publicBookingEnabled: false,
    provisional: true,
  },
  venue: {
    locationLabel: "Philippines · exact venue coming soon",
    address: null,
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
    direction: "Playful future court club",
    tagline: "Find your hour. Own the rally.",
    primary: "#10231D",
    paper: "#F7F4EA",
    electric: "#2457F5",
    citrus: "#D7FF43",
    coral: "#FF6B3D",
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
  ],
} as const satisfies DinktopiaTenantConfig;
