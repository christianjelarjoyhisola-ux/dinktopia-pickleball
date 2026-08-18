import type { MetadataRoute } from "next";
import { activeTenant } from "./tenants/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = `https://${activeTenant.identity.productionDomain}`;
  return ["", "/courts", "/book"].map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "/book" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.8,
  }));
}
