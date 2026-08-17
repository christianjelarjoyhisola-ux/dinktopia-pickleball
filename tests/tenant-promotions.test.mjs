import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("player details remain resumable only for a verified active tenant hold", async () => {
  const sql = await readFile(
    new URL("operations/2026-08-17-resumable-public-booking-details.sql", root),
    "utf8",
  );
  const tenantResolution = sql.indexOf(
    "v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname)",
  );
  const tokenCheck = sql.indexOf(
    "v_expected_hash is null or v_expected_hash is distinct from v_actual_hash",
  );
  const activeHoldCheck = sql.indexOf("v_booking.status <> 'pending_payment'");
  const detailsUpdate = sql.indexOf("update public.bookings");

  assert.ok(tenantResolution >= 0);
  assert.ok(tokenCheck > tenantResolution);
  assert.ok(activeHoldCheck > tokenCheck);
  assert.ok(detailsUpdate > activeHoldCheck);
  assert.match(
    sql.slice(detailsUpdate),
    /where tenant_id = v_tenant_id\s+and id = v_booking\.id/,
  );
  assert.match(
    sql,
    /if lower\(btrim\(p_tenant_slug\)\) <> 'kl-pickleball-court'[\s\S]*?then[\s\S]*?Player details have already been completed\./,
    "existing tenants must retain the prior exact-replay contract",
  );
});

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

test("the K&L deployment has one build-time tenant and preserves Dinktopia as a separate registry entry", async () => {
  const [registry, klConfig, dinktopiaConfig] = await Promise.all([
    readFile(new URL("app/tenants/registry.ts", root), "utf8"),
    readFile(new URL("app/tenants/kl-pickleball-court/config.ts", root), "utf8"),
    readFile(new URL("app/tenants/dinktopia/config.ts", root), "utf8"),
  ]);

  assert.match(registry, /ACTIVE_TENANT_SLUG\s*=\s*"kl-pickleball-court"\s+as const/);
  assert.match(
    registry,
    /tenantRegistry\s*=\s*\{[\s\S]*?dinktopia:\s*dinktopiaConfig,[\s\S]*?"kl-pickleball-court":\s*klPickleballCourtConfig/,
  );
  assert.match(
    registry,
    /activeTenant:[\s\S]*?=\s*tenantRegistry\[ACTIVE_TENANT_SLUG\]/,
  );
  assert.doesNotMatch(
    registry,
    /(?:URLSearchParams|location\.(?:search|hash)|localStorage|sessionStorage|document\.cookie|process\.env)[\s\S]{0,100}(?:tenant|slug)/i,
    "browser, cookie, storage, and runtime environment input must not select the tenant",
  );

  assert.match(klConfig, /slug:\s*"kl-pickleball-court"/);
  assert.doesNotMatch(klConfig, /slug:\s*"dinktopia"/i);
  assert.match(dinktopiaConfig, /slug:\s*"dinktopia"/);
  assert.doesNotMatch(dinktopiaConfig, /slug:\s*"kl-pickleball-court"/i);
  assert.doesNotMatch(klConfig, /from\s+["'][^"']*dinktopia/i);
  assert.doesNotMatch(dinktopiaConfig, /from\s+["'][^"']*kl-pickleball-court/i);
});

test("all browser Supabase tenant selectors come from the fixed active tenant", async () => {
  const client = await readFile(new URL("app/lib/platform/client.ts", root), "utf8");
  const rpcTenantSelectors = [...client.matchAll(/p_tenant_slug\s*:\s*([^,}\n]+)/g)].map(
    (match) => match[1].trim(),
  );
  const tenantHeaders = [...client.matchAll(/["']X-Tenant-Slug["']\s*:\s*([^,}\n]+)/g)].map(
    (match) => match[1].trim(),
  );

  assert.ok(rpcTenantSelectors.length >= 15, "expected broad RPC tenant-scope coverage");
  assert.ok(tenantHeaders.length >= 4, "expected broad Edge Function tenant-scope coverage");
  assert.deepEqual(
    new Set(rpcTenantSelectors),
    new Set(["activeTenant.identity.slug"]),
    "RPCs must not accept or hard-code an alternate tenant selector",
  );
  assert.deepEqual(
    new Set(tenantHeaders),
    new Set(["activeTenant.identity.slug"]),
    "Edge Function headers must use the same fixed tenant selector",
  );
  assert.doesNotMatch(client, /p_tenant_(?:id|uuid)\s*:/i);
  assert.doesNotMatch(client, /["']X-Tenant-(?:Id|Uuid)["']\s*:/i);
  assert.doesNotMatch(client, /tenantSlug\s*:\s*["']dinktopia["']/i);
  assert.match(
    client,
    /function registeredManagementOrigin\([\s\S]*?activeTenant\.identity\.productionDomain[\s\S]*?function managementHostname\([\s\S]*?origin !== registeredOrigin/,
    "management writes must also be restricted to the K&L registered origin",
  );
});

test("local browser recovery state and management writes are tenant-bound", async () => {
  const [booking, adapter] = await Promise.all([
    readFile(new URL("app/booking-experience.tsx", root), "utf8"),
    readFile(new URL("app/manage/management-adapter.ts", root), "utf8"),
  ]);

  assert.match(booking, /const tenantStoragePrefix = activeTenant\.identity\.slug/);
  for (const artifact of ["booking", "pending", "storage-probe", "active-hold"]) {
    assert.match(
      booking,
      new RegExp(`\\$\\{tenantStoragePrefix\\}:${artifact}`),
      `${artifact} state must be namespaced by the fixed tenant slug`,
    );
  }
  assert.doesNotMatch(
    booking,
    /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*["'](?:booking|pending|active-hold)/,
    "booking recovery data must never use an unscoped legacy key",
  );

  assert.match(
    adapter,
    /function assertActiveTenantContext\(context: ManagementContext\): void \{\s*if \(context\.tenantSlug !== activeTenant\.identity\.slug\) \{\s*throw new Error\("LIVE_TENANT_SCOPE_MISMATCH"\)/,
  );
  assert.match(
    adapter,
    /tenantSlug !== activeTenant\.identity\.slug \|\| status !== "active"[\s\S]*?throw new Error\("LIVE_MANAGER_SESSION_INVALID"\)/,
    "a session for Dinktopia or another tenant must be rejected locally",
  );
  assert.doesNotMatch(
    adapter,
    /(?:context\.tenantSlug|session\.tenantSlug)\s*=\s*activeTenant\.identity\.slug/,
    "tenant mismatches must be rejected, not silently rewritten",
  );
});

test("local SQL changes resolve one tenant and contain no Dinktopia-targeted data mutation", async () => {
  const operationsUrl = new URL("operations/", root);
  const sqlNames = (await readdir(operationsUrl)).filter((name) => name.endsWith(".sql"));
  assert.ok(sqlNames.length >= 3, "expected the checked-in shared-platform SQL changes");

  for (const name of sqlNames) {
    const sql = await readFile(new URL(name, operationsUrl), "utf8");
    assert.match(sql, /public\.resolve_tenant_id\(p_tenant_slug,\s*p_hostname\)/i, `${name} must resolve scope server-side`);
    assert.match(sql, /where[\s\S]{0,160}?tenant_id\s*=\s*v_tenant_id/i, `${name} must filter persisted data by resolved tenant UUID`);
    assert.doesNotMatch(
      sql,
      /(?:insert\s+into|update|delete\s+from)[^;]{0,500}?["']dinktopia["']/i,
      `${name} must not seed, update, or delete Dinktopia data`,
    );
    const mutations = [...sql.matchAll(/\b(?:update\s+public\.[a-z_]+|delete\s+from\s+public\.[a-z_]+)[\s\S]*?;/gi)]
      .map((match) => match[0]);
    for (const mutation of mutations) {
      const usesResolvedTenant = /tenant_id\s*=\s*v_tenant_id/i.test(mutation);
      const usesPreviouslyScopedBooking =
        name === "2026-08-10-complete-public-booking-details.sql" &&
        /^update\s+public\.bookings\b/i.test(mutation) &&
        /where\s+id\s*=\s*v_booking\.id/i.test(mutation) &&
        /from public\.bookings b[\s\S]*?where b\.tenant_id = v_tenant_id[\s\S]*?for update;/i.test(sql);
      assert.ok(
        usesResolvedTenant || usesPreviouslyScopedBooking,
        `${name} contains a shared-table mutation without resolved tenant scope: ${mutation.slice(0, 80)}`,
      );
    }
  }
});
