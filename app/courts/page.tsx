import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import { activeTenant } from "../tenants/registry";
import "../dinktopia.css";

export const metadata: Metadata = {
  title: "Our Courts",
  description: `Explore ${activeTenant.identity.shortName} courts, current rates, and live booking availability.`,
  alternates: { canonical: "/courts" },
};

export default function CourtsPage() {
  return <BookingExperience surface="courts" />;
}
