import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../app/lib/platform/client.ts", import.meta.url), "utf8");
const adapter = await readFile(new URL("../app/manage/management-adapter.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/manage/page.tsx", import.meta.url), "utf8");

test("court gallery mutations remain authenticated and pinned to the active tenant and court", () => {
  assert.match(client, /edgeUrl\("tenant-court-gallery-asset"\)/);
  assert.match(client, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(client, /"X-Tenant-Slug": activeTenant\.identity\.slug/);
  assert.match(client, /"X-Court-Id": courtId/);
  assert.match(client, /managementHostname\(\{ mutation: true \}\)/);
  assert.match(client, /"X-Asset-Action": action/);
  assert.match(client, /form\.append\("galleryFile", file\)/);
  assert.match(client, /file\.size > 5 \* 1024 \* 1024/);
  assert.doesNotMatch(client.slice(client.indexOf("export type CourtGalleryAsset"), client.indexOf("export type ReceiptView")), /tenantId|service.role|service_role/i);
});

test("system and tenant venue managers can manage public court photos through guarded UI", () => {
  assert.match(adapter, /async manageCourtGalleryPhoto\(context, input\)/);
  assert.match(adapter, /assertActiveTenantContext\(context\)/);
  assert.match(adapter, /assertVenueManager\(authority\)/);
  assert.match(adapter, /requiredUuid\(input\.courtId, "COURT_ID_INVALID"\)/);
  assert.match(adapter, /action\.type === "court:gallery-delete"/);
  assert.match(adapter, /deleteTenantCourtGalleryPhoto\(session\.access_token, courtId\)/);
  assert.match(page, /Public gallery photo/);
  assert.match(page, /Replace photo/);
  assert.match(page, /Save photo text/);
  assert.match(page, /actionType: "court:gallery-delete"/);
  assert.match(page, /disabled=\{!can\("settings:update"\)/);
  assert.match(page, /Photo description <small>For accessibility<\/small>/);
});
