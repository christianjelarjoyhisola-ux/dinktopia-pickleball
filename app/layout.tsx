import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { headers } from "next/headers";
import { activeTenant } from "./tenants/registry";
import { InitialBrandLoader } from "./initial-brand-loader";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

const title = `${activeTenant.identity.name} — ${activeTenant.brand.tagline ?? "Court booking"}`;
const description =
  `Reserve a court at ${activeTenant.identity.name}. View live availability, rates, booking rules, and payment instructions.`;

function configuredTenantOrigin(): string | null {
  const domain = activeTenant.identity.productionDomain?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(domain)) return null;
  try {
    return new URL(`https://${domain}`).origin;
  } catch {
    return null;
  }
}

function safeRequestOrigin(requestHeaders: Headers): string {
  const configured = configuredTenantOrigin();
  if (configured) return configured;
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
  const socialImagePath = activeTenant.brand.socialImagePath;
  const socialImage = socialImagePath
    ? new URL(socialImagePath, origin).toString()
    : null;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${activeTenant.identity.name}` },
    description,
    applicationName: activeTenant.identity.name,
    keywords: [
      "pickleball",
      "pickleball court",
      "court booking",
      activeTenant.identity.name,
    ],
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: activeTenant.identity.locale.replace("-", "_"),
      siteName: activeTenant.identity.name,
      title,
      description,
      ...(socialImage
        ? {
            images: [{
              url: socialImage,
              width: 1734,
              height: 907,
              alt: `${activeTenant.identity.name} — ${activeTenant.brand.tagline ?? "pickleball court"}`,
            }],
          }
        : {}),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(socialImage ? { images: [socialImage] } : {}),
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={activeTenant.identity.locale}>
      <body
        className={`${dmSans.variable} ${sora.variable}`}
      >
        <InitialBrandLoader />
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
