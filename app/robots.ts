import type { MetadataRoute } from "next";
import { activeTenant } from "./tenants/registry";

export default function robots(): MetadataRoute.Robots {
  const origin = `https://${activeTenant.identity.productionDomain}`;
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/manage", "/book?mode=manage"],
    }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
