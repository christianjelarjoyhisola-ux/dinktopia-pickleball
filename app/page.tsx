import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import "./dinktopia.css";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Meet Dinktopia Pickleball, explore the club, and start planning your next rally.",
};

export default function Home() {
  return <BookingExperience surface="home" />;
}
