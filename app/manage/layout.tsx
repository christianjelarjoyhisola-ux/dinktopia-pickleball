import type { Metadata } from "next";
import { activeTenant } from "../tenants/registry";

export const metadata: Metadata = {
  title: "Management",
  description: `Manage ${activeTenant.identity.name} setup, courts, schedules, bookings, and tenant settings.`,
  robots: { index: false, follow: false },
};

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
