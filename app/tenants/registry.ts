import { dinktopiaConfig } from "./dinktopia/config";

export const ACTIVE_TENANT_SLUG = "dinktopia" as const;

const tenantRegistry = {
  dinktopia: dinktopiaConfig,
} as const;

export type RegisteredTenantSlug = keyof typeof tenantRegistry;

export function getTenantConfig(slug: string) {
  if (slug !== ACTIVE_TENANT_SLUG) {
    throw new Error("Unknown tenant.");
  }
  return tenantRegistry[slug];
}

export const activeTenant = getTenantConfig(ACTIVE_TENANT_SLUG);
