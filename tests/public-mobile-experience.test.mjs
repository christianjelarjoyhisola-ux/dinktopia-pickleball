import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const experience = fs.readFileSync("app/booking-experience.tsx", "utf8");
const styles = fs.readFileSync("app/dinktopia.css", "utf8");

test("keeps the K&L public shell stable and readable on mobile", () => {
  assert.match(experience, /!isBookingPage \? " public-route"/);
  assert.match(experience, /isHome \? " home-route"/);
  assert.match(experience, /isCourtsPage \? " courts-route"/);

  assert.match(styles, /\.kl-court-site\s*\{[\s\S]*?overflow-x: clip;/);
  assert.match(styles, /:is\(a, button, label, summary, \[role="button"\]\)\s*\{\s*touch-action: manipulation;/);
  assert.match(
    styles,
    /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea\)[\s\S]*?font-size: 16px !important;/,
  );
  assert.match(styles, /\.kl-court-site\.public-route \.primary-nav\.is-open[\s\S]*?max-height: calc\(100dvh - 88px\)/);
  assert.match(styles, /\.kl-court-site\.home-route \.gallery-grid[\s\S]*?grid-template-columns: 1fr;[\s\S]*?overflow: visible;/);
  assert.match(experience, /body\.style\.position = "fixed"/);
  assert.match(experience, /event\.key === "Escape"/);
  assert.match(experience, /event\.key !== "Tab"/);
  assert.match(experience, /mobileMenuQuery\.addEventListener\("change", closeNavigationAtDesktopWidth\)/);
  assert.match(experience, /focusable\[0\]\?\.focus\(\)/);
  assert.match(experience, /if \(document\.contains\(trigger\)\) trigger\.focus\(\)/);
  assert.match(experience, /!checkingLiveSetup && !bookingSetupReady && \(/);
  assert.doesNotMatch(experience, /<strong>Connecting to K&amp;L<\/strong>/);
  assert.match(experience, /className="nav-admin-link" href="\/manage"/);
  assert.match(experience, /className="footer-admin-link" href="\/manage"/);
  assert.match(experience, /aria-label=\{mobileNavOpen \? "Close navigation" : "Open navigation"\}/);
  assert.match(styles, /\.kl-court-site\.public-route \.primary-nav > \.nav-admin-link/);
  assert.match(styles, /\.mobile-sticky-date-nav[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(styles, /\.mobile-sticky-date-current[\s\S]*?min-height: 44px;/);
  assert.doesNotMatch(styles, /user-scalable\s*:\s*no|maximum-scale\s*:\s*1/);
});
