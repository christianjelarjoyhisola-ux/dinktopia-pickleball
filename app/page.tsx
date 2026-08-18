import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import { activeTenant } from "./tenants/registry";
import "./dinktopia.css";

export const metadata: Metadata = {
  title: "Pickleball Court Booking",
  description: `${activeTenant.identity.name} — ${activeTenant.brand.tagline ?? "your local pickleball court"} View live courts, rates, and availability.`,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <BookingExperience surface="home" />;
}
