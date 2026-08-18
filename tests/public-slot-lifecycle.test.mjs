import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sqlPath = new URL("../operations/2026-08-18-public-slot-lifecycle.sql", import.meta.url);
const clientPath = new URL("../app/lib/platform/client.ts", import.meta.url);
const bookingPath = new URL("../app/booking-experience.tsx", import.meta.url);

test("public slot lifecycle is tenant-scoped and contains no private booking data", async () => {
  const sql = await readFile(sqlPath, "utf8");

  assert.match(sql, /public\.resolve_tenant_id\(p_tenant_slug, p_hostname\)/);
  assert.match(sql, /slot\.tenant_id = v_tenant_id/);
  assert.match(sql, /booking\.tenant_id = slot\.tenant_id/);
  assert.match(sql, /security definer[\s\S]*?set row_security = 'off'/i);
  assert.match(sql, /booking\.status = 'pending_payment'[\s\S]*?slot\.hold_expires_at > now\(\)/);
  assert.match(sql, /booking\.status = 'payment_review'/);
  assert.match(sql, /booking\.status in \('confirmed', 'completed'\)/);
  assert.match(sql, /grant execute[\s\S]*?to anon, authenticated/);
  const payloadStart = sql.indexOf("jsonb_build_object(");
  const payloadEnd = sql.indexOf("order by slot.starts_at", payloadStart);
  const payload = sql.slice(payloadStart, payloadEnd);
  assert.match(payload, /'courtId'[\s\S]*?'startsAt'[\s\S]*?'endsAt'[\s\S]*?'state'/);
  assert.doesNotMatch(payload, /customer_|receipt|reference|access_token|payment_reference/i);
});

test("availability consumes only a whitelisted coarse lifecycle with a safe rollout fallback", async () => {
  const [client, booking] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(bookingPath, "utf8"),
  ]);

  assert.match(client, /rpc<unknown>\("get_public_slot_lifecycle", scope\)/);
  assert.match(client, /error\.code === "PGRST202"/);
  assert.match(client, /function validatedPublicSlotLifecycle[\s\S]*?value\.slice\(0, 1_000\)/);
  assert.match(booking, /\["held", "payment_review", "confirmed"\]\.includes\(lifecycle\.state\)/);
  assert.match(booking, /const displayedState = slot\?\.hasStarted \? undefined : ownedState \?\? slot\?\.publicState/);
  assert.doesNotMatch(booking, /slotLifecycle[\s\S]{0,200}(reference|customer|receipt|token)/i);
});
