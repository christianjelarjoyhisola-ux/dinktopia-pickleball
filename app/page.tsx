import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import { activeTenant } from "./tenants/registry";
import "./dinktopia.css";

export const metadata: Metadata = {
  title: "Home",
  description: `${activeTenant.identity.name} is in setup. Court and booking details are coming soon.`,
};

export default function HomePage() {
  return <BookingExperience surface="home" />;
}
