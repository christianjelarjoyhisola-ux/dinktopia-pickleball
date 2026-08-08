import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const title = "Dinktopia Pickleball — Find your hour";
const description =
  "Discover courts, compare live hours, and plan your next rally with Dinktopia Pickleball.";

function safeRequestOrigin(requestHeaders: Headers): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the current request host.
    }
  }
  const host =
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) {
    return "http://localhost:3000";
  }
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "https" ? "https" : "http";
  return `${protocol}://${host}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = safeRequestOrigin(await headers());
  const socialImage = new URL("/og.png", origin).toString();
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s · Dinktopia Pickleball" },
    description,
    applicationName: "Dinktopia Pickleball",
    keywords: ["pickleball", "court booking", "Dinktopia", "Philippines"],
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_PH",
      siteName: "Dinktopia Pickleball",
      title,
      description,
      images: [{ url: socialImage, width: 1729, height: 910, alt: "Dinktopia — Your next rally starts here." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH">
      <body
        className={`${manrope.variable} ${spaceGrotesk.variable}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
