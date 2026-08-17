import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import { activeTenant } from "./tenants/registry";
import "./dinktopia.css";

export const metadata: Metadata = {
  title: "Local Pickleball, Coming Soon",
  description: `${activeTenant.identity.name} — ${activeTenant.brand.tagline ?? "a local pickleball court community"} Verified venue and booking details will be published when setup is complete.`,
};

export default function HomePage() {
  return <BookingExperience surface="home" />;
}
