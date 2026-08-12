import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ending an offer is tenant-scoped, owner-authorized, and audited", async () => {
  const sql = await readFile(new URL("../operations/2026-08-13-end-tenant-promotion.sql", import.meta.url), "utf8");
  assert.match(sql, /resolve_tenant_id\(p_tenant_slug, p_hostname\)/);
  assert.match(sql, /request_origin_matches_tenant\(v_tenant_id\)/);
  assert.match(sql, /membership\.role = 'owner'/);
  assert.match(sql, /where promotion\.tenant_id = v_tenant_id[\s\S]*promotion\.id = p_promotion_id/);
  assert.match(sql, /'promotion\.ended'/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.tenant_promotions/i);
});
