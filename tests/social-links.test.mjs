import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const experience = fs.readFileSync("app/booking-experience.tsx", "utf8");
const klConfig = fs.readFileSync("app/tenants/kl-pickleball-court/config.ts", "utf8");
const dinktopiaConfig = fs.readFileSync("app/tenants/dinktopia/config.ts", "utf8");

test("publishes the owner-provided Facebook page only for K&L", () => {
  assert.match(klConfig, /facebook: "https:\/\/www\.facebook\.com\/profile\.php\?id=61583037885610"/);
  assert.match(dinktopiaConfig, /socialLinks:\s*\{\s*facebook: null/);
  assert.match(experience, /className="community-card community-card-featured community-card-link"/);
  assert.match(experience, /<small>Official Facebook<\/small>/);
  assert.match(experience, /Follow K&amp;L Pickleball Court/);
  assert.match(experience, /activeTenant\.socialLinks\.facebook && <a href=\{activeTenant\.socialLinks\.facebook\}/);
});
