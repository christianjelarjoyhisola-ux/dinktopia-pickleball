import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const experience = fs.readFileSync("app/booking-experience.tsx", "utf8");
const klConfig = fs.readFileSync("app/tenants/kl-pickleball-court/config.ts", "utf8");

test("publishes K&L's verified venue location and links it to Google Maps", () => {
  assert.match(klConfig, /locationLabel: "5H57\+77, Tubay, Agusan del Norte"/);
  assert.match(klConfig, /mapsUrl: "https:\/\/www\.google\.com\/maps\/place\/K%26L\+Pickleball\+Court/);
  assert.match(experience, /className="hero-location hero-location-link"/);
  assert.match(experience, /<small>Open in Google Maps<\/small>/);
  assert.match(experience, /mapsUrl=\{venueMapsUrl\}/);
  assert.match(experience, /className="summary-detail summary-location-link"/);
});
