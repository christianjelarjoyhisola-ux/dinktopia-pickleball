import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import "../dinktopia.css";

type BookPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: BookPageProps): Promise<Metadata> {
  const params = await searchParams;
  const isManageMode = params.mode === "manage";

  return isManageMode
    ? {
        title: "Manage Booking",
        description: "Find and manage an existing Dinktopia court booking.",
      }
    : {
        title: "Book a Court",
        description: "Choose a Dinktopia time, review the booking details, and reserve your court.",
      };
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;
  const requestedCourt = typeof params.court === "string" ? params.court.trim() : undefined;
  const courtSlug =
    requestedCourt && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(requestedCourt)
      ? requestedCourt
      : undefined;
  const initialMode = params.mode === "manage" ? "manage" : "book";
  const requestedOffer = typeof params.offer === "string" ? params.offer.trim() : undefined;
  const initialOfferId = requestedOffer && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(requestedOffer)
    ? requestedOffer
    : undefined;
  const requestedDate = typeof params.date === "string" ? params.date.trim() : undefined;
  const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : undefined;

  return (
    <BookingExperience
      key={`${initialMode}:${courtSlug ?? "default"}:${initialOfferId ?? "no-offer"}:${initialDate ?? "default-date"}`}
      surface="booking"
      initialCourtSlug={courtSlug}
      initialMode={initialMode}
      initialOfferId={initialOfferId}
      initialDate={initialDate}
    />
  );
}
