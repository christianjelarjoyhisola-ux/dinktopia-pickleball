import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import { activeTenant } from "../tenants/registry";
import "../dinktopia.css";

export const metadata: Metadata = {
  title: "Our Courts",
  description: `Explore ${activeTenant.identity.shortName} courts when verified surface, facility, and availability details are published. Venue setup is still in progress.`,
};

export default function CourtsPage() {
  return <BookingExperience surface="courts" />;
}
