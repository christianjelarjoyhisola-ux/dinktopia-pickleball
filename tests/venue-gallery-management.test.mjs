import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../app/lib/platform/client.ts", import.meta.url), "utf8");
const adapter = await readFile(new URL("../app/manage/management-adapter.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/manage/page.tsx", import.meta.url), "utf8");
const booking = await readFile(new URL("../app/booking-experience.tsx", import.meta.url), "utf8");

test("multi-photo venue gallery uses the authenticated fixed-tenant service", () => {
  assert.match(client, /edgeUrl\("tenant-venue-gallery-asset"\)/);
  assert.match(client, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(client, /"X-Tenant-Slug": activeTenant\.identity\.slug/);
  assert.match(client, /managementHostname\(\{ mutation: action !== "list" \}\)/);
  assert.match(client, /form\.append\("venueFile", input\.file\)/);
  assert.match(client, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(client, /"list" \| "upload" \| "metadata" \| "delete" \| "reorder"/);
  assert.doesNotMatch(client.slice(client.indexOf("export type VenueGalleryCategory"), client.indexOf("export type ReceiptView")), /service_role|tenantId/i);
});

test("gallery manager supports drafts, publishing, metadata, order, and removal", () => {
  assert.match(adapter, /assertVenueManager\(authority\)/);
  assert.match(adapter, /venueGalleryItems\(result\.items\)/);
  assert.match(adapter, /canonicalPath/);
  assert.match(adapter, /url\.origin === SHARED_SUPABASE_ORIGIN/);
  assert.match(page, /Gallery manager/);
  assert.match(page, /multiple/);
  assert.match(page, /uploaded as .*draft/si);
  assert.match(page, /Show in guest gallery/);
  assert.match(page, /Featured photo/);
  assert.match(page, /Move earlier/);
  assert.match(page, /Move later/);
  assert.match(page, /actionType: "venue:gallery-delete"/);
});

test("guest gallery displays only strict published venue assets and falls back to court photos", () => {
  assert.match(booking, /tenantBootstrap\.tenant\.publicConfig\?\.venueGallery/);
  assert.match(booking, /item\.published !== true/);
  assert.match(booking, /venue-gallery\/\$\{id\}/);
  assert.match(booking, /url\.origin === "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/);
  assert.match(booking, /url\.pathname\.startsWith\("\/storage\/v1\/object\/public\/tenant-public-assets\/"\)/);
  assert.match(booking, /return \[\.\.\.venuePhotos, \.\.\.courtPhotos\]\.slice\(0, 5\)/);
});
