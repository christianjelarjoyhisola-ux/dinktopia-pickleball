import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("promotion migration is additive and limited to registered tenants at the shared hold boundary", async () => {
  const sql = await readFile(new URL("operations/2026-08-11-tenant-promotions.sql", root), "utf8");
  const baseCall = sql.indexOf("v_result := public.create_public_booking_group_with_access_base_v1(");
  const registeredTenantGuard = sql.indexOf(
    "if lower(btrim(p_tenant_slug)) not in ('dinktopia', 'kl-pickleball-court') then",
  );
  const promotionLookup = sql.indexOf(
    "from public.tenant_promotions promotion",
    registeredTenantGuard,
  );

  assert.match(sql, /This migration is additive\. It creates no offers and updates no existing/);
  assert.ok(baseCall >= 0, "the original protected hold function must remain the pricing base");
  assert.ok(
    registeredTenantGuard > baseCall,
    "the tenant guard must run after the original hold result exists",
  );
  assert.ok(
    promotionLookup > registeredTenantGuard,
    "promotion reads must occur only after the registered-tenant guard",
  );
  assert.match(sql.slice(registeredTenantGuard, promotionLookup), /return v_result;/);
  assert.doesNotMatch(sql, /insert into public\.tenant_promotions[\s\S]*?values\s*\([^p]*'dinktopia'/i);
});

test("browser promotion calls derive tenant scope from the local tenant registry", async () => {
  const client = await readFile(new URL("app/lib/platform/client.ts", root), "utf8");
  const createStart = client.indexOf("export async function createTenantPromotion");
  const createEnd = client.indexOf("\nexport ", createStart + 20);
  const implementation = client.slice(createStart, createEnd < 0 ? undefined : createEnd);

  assert.match(implementation, /p_tenant_slug: activeTenant\.identity\.slug/);
  assert.match(implementation, /p_hostname: managementHostname\(\{ mutation: true \}\)/);
  assert.doesNotMatch(implementation, /tenantId|tenant_id/);
});
