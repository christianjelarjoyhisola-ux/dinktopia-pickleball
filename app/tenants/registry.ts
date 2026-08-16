import { dinktopiaConfig } from "./dinktopia/config";
import { klPickleballCourtConfig } from "./kl-pickleball-court/config";
import type { TenantConfig } from "./types";

export const ACTIVE_TENANT_SLUG = "kl-pickleball-court" as const;

export const tenantRegistry = {
  dinktopia: dinktopiaConfig,
  "kl-pickleball-court": klPickleballCourtConfig,
} as const;

export type RegisteredTenantSlug = keyof typeof tenantRegistry;

export function getTenantConfig(slug: string): TenantConfig {
  if (!Object.prototype.hasOwnProperty.call(tenantRegistry, slug)) {
    throw new Error("Unknown tenant.");
  }
  return tenantRegistry[slug as RegisteredTenantSlug];
}

// Deployment scope is fixed at build time and never selected from browser input.
export const activeTenant: TenantConfig<typeof ACTIVE_TENANT_SLUG> =
  tenantRegistry[ACTIVE_TENANT_SLUG];
