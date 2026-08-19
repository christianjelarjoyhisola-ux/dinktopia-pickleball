import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const experience = fs.readFileSync("app/booking-experience.tsx", "utf8");

test("shows verified K&L court photos in the public court directory", () => {
  for (let court = 1; court <= 4; court += 1) {
    const path = `public/kl-court-${court}.jpg`;
    assert.equal(fs.existsSync(path), true, `${path} must ship with the public build`);
    assert.ok(fs.statSync(path).size > 50_000, `${path} must contain a real venue photo`);
  }

  assert.match(experience, /activeTenant\.identity\.slug === "kl-pickleball-court"/);
  assert.match(experience, /`\/kl-court-\$\{localPhotoNumber\}\.jpg`/);
  assert.match(experience, /publishedPhoto \|\| localPhoto \|\| undefined/);
  assert.match(experience, /className="court-card-photo"/);
  assert.match(experience, /alt=\{court\.photoAlt \|\| `\$\{court\.name\} at \$\{activeTenant\.identity\.name\}`\}/);
});
