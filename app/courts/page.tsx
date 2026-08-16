import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import { activeTenant } from "../tenants/registry";
import "../dinktopia.css";

export const metadata: Metadata = {
  title: "Courts",
  description: `${activeTenant.identity.name} court details will be published after venue setup is complete.`,
};

export default function CourtsPage() {
  return <BookingExperience surface="courts" />;
}
