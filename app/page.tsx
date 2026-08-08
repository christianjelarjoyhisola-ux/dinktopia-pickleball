import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import "./dinktopia.css";

export const metadata: Metadata = {
  title: "Dinktopia | Pickleball, on your time",
  description:
    "Find a court, choose your hour, and get your next Dinktopia rally on the calendar.",
};

export default function Home() {
  return <BookingExperience />;
}
