import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  booking: new URL("../app/booking-experience.tsx", import.meta.url),
  client: new URL("../app/lib/platform/client.ts", import.meta.url),
  config: new URL("../app/tenants/dinktopia/config.ts", import.meta.url),
  globalsCss: new URL("../app/globals.css", import.meta.url),
  layout: new URL("../app/layout.tsx", import.meta.url),
  manage: new URL("../app/manage/page.tsx", import.meta.url),
  managementAdapter: new URL(
    "../app/manage/management-adapter.ts",
    import.meta.url,
  ),
  manageCss: new URL("../app/manage/manage.module.css", import.meta.url),
  logo: new URL("../public/dinktopia-logo.png", import.meta.url),
  og: new URL("../public/og.png", import.meta.url),
  packageJson: new URL("../package.json", import.meta.url),
  page: new URL("../app/page.tsx", import.meta.url),
  publicCss: new URL("../app/dinktopia.css", import.meta.url),
  registry: new URL("../app/tenants/registry.ts", import.meta.url),
  types: new URL("../app/lib/platform/types.ts", import.meta.url),
  worker: new URL("../worker/index.ts", import.meta.url),
};

const starterMarkers =
  /codex-preview|Your site is taking shape|Building your site|SkeletonPreview|react-loading-skeleton/i;

let workerPromise;

function getWorker() {
  workerPromise ??= (async () => {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    const workerModule = await import(workerUrl.href);
    return workerModule.default;
  })();
  return workerPromise;
}

async function render(pathname, origin = "http://localhost") {
  const worker = await getWorker();
  return worker.fetch(
    new Request(new URL(pathname, origin), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function documentText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function documentTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  assert.ok(match, "expected the rendered document to contain a title");
  return decodeEntities(match[1]);
}

function countTags(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b`, "gi"))?.length ?? 0;
}

function assertHtmlResponse(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
}

test("server-renders the complete public Dinktopia booking experience", async () => {
  const response = await render("/");
  assertHtmlResponse(response);

  const html = await response.text();
  const text = documentText(html);

  assert.equal(
    documentTitle(html),
    "Dinktopia | Pickleball, on your time · Dinktopia Pickleball",
  );
  assert.match(html, /<html\b[^>]*\blang="en-PH"/i);
  assert.match(html, /<meta\b[^>]*\bname="robots"[^>]*\bcontent="noindex, nofollow"/i);
  assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i);
  assert.equal(countTags(html, "main"), 1);
  assert.equal(countTags(html, "header"), 1);
  assert.equal(countTags(html, "nav"), 1);
  assert.equal(countTags(html, "footer"), 1);
  assert.match(html, /<main\b[^>]*id="main-content"/i);
  assert.match(html, /class="hero-visual"[^>]*aria-hidden="true"/i);
  assert.match(text, /Dinktopia Pickleball Club/i);
  assert.match(text, /Your next rally starts here\./i);
  assert.match(text, /Same game\. Different energy\./i);
  assert.match(text, /Court 01/i);
  assert.match(text, /Court 02/i);
  assert.match(text, /Book a court/i);
  assert.match(text, /Manage booking/i);
  assert.match(text, /Good games live here\./i);
  assert.match(html, /Play more\. Rally often\. Stay curious\./i);
  assert.match(html, /class="ticker-sequence"[^>]*aria-hidden="true"/i);
  assert.equal((html.match(/class="ticker-sequence"/g) ?? []).length, 1);
  assert.match(html, /PLAY MORE[\s\S]*RALLY OFTEN[\s\S]*STAY CURIOUS/i);
  assert.doesNotMatch(html, /ticker-toggle|Pause moving phrase banner/i);
  assert.doesNotMatch(html, starterMarkers);
});

test("server-renders the responsive tenant management workspace", async () => {
  const response = await render("/manage");
  assertHtmlResponse(response);

  const html = await response.text();
  const text = documentText(html);

  assert.match(documentTitle(html), /Dinktopia/i);
  assert.doesNotMatch(documentTitle(html), /Starter|taking shape/i);
  assert.match(html, /<html\b[^>]*\blang="en-PH"/i);
  assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i);
  assert.equal(countTags(html, "main"), 1);
  assert.equal(countTags(html, "aside"), 1);
  assert.equal(countTags(html, "nav"), 2);
  assert.equal(countTags(html, "footer"), 1);
  assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"/i);
  assert.match(text, /DINKTOPIA Court operations/i);
  assert.match(text, /Good afternoon, Alex\./i);
  assert.match(text, /Your courts are moving well/i);
  assert.match(text, /Loading Dinktopia management data/i);
  assert.match(text, /Asia\/Manila/);
  assert.match(text, /Server policy remains authoritative/i);
  assert.doesNotMatch(html, starterMarkers);
});

test("marks local customer and manager rendering as non-live preview", async () => {
  const [customerResponse, managerResponse] = await Promise.all([
    render("/"),
    render("/manage"),
  ]);
  const [customerHtml, managerHtml] = await Promise.all([
    customerResponse.text(),
    managerResponse.text(),
  ]);
  const customerText = documentText(customerHtml);
  const managerText = documentText(managerHtml);

  assert.match(customerHtml, /class="preview-ribbon"[^>]*role="status"/i);
  assert.match(customerText, /Setup preview/i);
  assert.match(
    customerText,
    /No live reservations or payments are created\./i,
  );
  assert.match(customerText, /Booking preview/i);

  assert.match(managerText, /Preview mode/i);
  assert.match(managerText, /Bookings are not public/i);
  assert.match(managerText, /UI preview only/i);
  assert.match(managerHtml, /aria-label="Non-authoritative preview controls"/i);
  assert.match(managerText, /Dinktopia tenant preview/i);
});

test("applies centralized security headers to HTTP and HTTPS responses", async () => {
  const [workerSource, httpResponse, httpsResponse, missingResponse] =
    await Promise.all([
      readFile(files.worker, "utf8"),
      render("/"),
      render("/", "https://preview.dinktopia.example"),
      render("/route-that-does-not-exist"),
    ]);

  assert.match(workerSource, /function withSecurityHeaders\(/);
  assert.ok(
    (workerSource.match(/withSecurityHeaders\(response, request\)/g) ?? [])
      .length >= 2,
    "expected both application and optimized-image responses to use the shared header policy",
  );

  for (const response of [httpResponse, httpsResponse, missingResponse]) {
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /challenges\.cloudflare\.com/);
    assert.match(csp, /https:\/\/\*\.supabase\.co/);
    assert.match(csp, /wss:\/\/\*\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    assert.equal(
      response.headers.get("cross-origin-opener-policy"),
      "same-origin",
    );
  }

  assert.equal(httpResponse.headers.get("strict-transport-security"), null);
  assert.equal(missingResponse.headers.get("strict-transport-security"), null);
  assert.equal(
    httpsResponse.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.match(
    httpsResponse.headers.get("content-security-policy") ?? "",
    /upgrade-insecure-requests/,
  );
});

test("removes the disposable Codex starter preview and skeleton dependency", async () => {
  const [page, layout, packageText] = await Promise.all([
    readFile(files.page, "utf8"),
    readFile(files.layout, "utf8"),
    readFile(files.packageJson, "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.doesNotMatch(page, starterMarkers);
  assert.doesNotMatch(layout, starterMarkers);
  assert.equal(packageJson.dependencies?.["react-loading-skeleton"], undefined);
  assert.equal(packageJson.devDependencies?.["react-loading-skeleton"], undefined);
  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});

test("uses the official transparent Dinktopia logo and extracted brand palette", async () => {
  const [booking, config, globalsCss, layout, manage, manageCss, publicCss, logo, og] =
    await Promise.all([
      readFile(files.booking, "utf8"),
      readFile(files.config, "utf8"),
      readFile(files.globalsCss, "utf8"),
      readFile(files.layout, "utf8"),
      readFile(files.manage, "utf8"),
      readFile(files.manageCss, "utf8"),
      readFile(files.publicCss, "utf8"),
      readFile(files.logo),
      readFile(files.og),
    ]);

  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(logo.readUInt32BE(16), 2046);
  assert.equal(logo.readUInt32BE(20), 769);
  assert.equal(logo[25], 6, "expected the public logo PNG to retain RGBA transparency");
  assert.ok(
    (booking.match(/src="\/dinktopia-logo\.png"/g) ?? []).length >= 2,
    "expected the official mark in both the customer header and footer",
  );
  assert.match(manage, /src="\/dinktopia-logo\.png"/);
  assert.match(booking, /aria-label="Dinktopia home"/);
  assert.match(
    booking,
    /sizes="\(max-width: 390px\) 128px, \(max-width: 779px\) 132px, 164px"/,
  );
  assert.match(
    publicCss,
    /\.wordmark\s*\{[^}]*width:\s*132px[^}]*background:\s*transparent[^}]*padding:\s*0/s,
  );
  assert.match(manageCss, /\.logoPlate\s*\{[^}]*background:\s*transparent/s);
  assert.match(
    publicCss,
    /\.site-header\s*\{[^}]*background:\s*rgba\(248,\s*251,\s*255,\s*0\.97\)[^}]*color:\s*var\(--ink\)/s,
  );
  assert.match(
    publicCss,
    /\.site-footer\s*\{[^}]*background:\s*var\(--paper-deep\)[^}]*color:\s*var\(--ink\)/s,
  );
  assert.match(
    publicCss,
    /\.site-header \.brand-logo,\s*\.site-footer \.brand-logo\s*\{[^}]*filter:\s*none/s,
  );
  assert.match(
    manageCss,
    /\.sidebar\s*\{[^}]*background:[^;]*var\(--brand-surface\);[^}]*color:\s*var\(--ink\)/s,
  );
  assert.match(
    manageCss,
    /\.sidebar \.brandLogo,\s*\.mobileBrand \.brandLogo\s*\{[^}]*filter:\s*none/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.mobileBrand\s*\{[^}]*background:\s*var\(--brand-surface\)[^}]*color:\s*var\(--ink\)/s,
  );

  for (const source of [globalsCss, publicCss]) {
    assert.match(source, /#102a43/i);
    assert.match(source, /#254c84/i);
    assert.match(source, /#82f500/i);
    assert.match(source, /#f4f7fa/i);
  }
  assert.match(config, /primary:\s*"#102A43"/);
  assert.match(config, /electric:\s*"#254C84"/);
  assert.match(config, /citrus:\s*"#82F500"/);

  assert.equal(og.readUInt32BE(16), 1727);
  assert.equal(og.readUInt32BE(20), 911);
  assert.match(layout, /width:\s*1727,\s*height:\s*911/);
});

test("pins Dinktopia to one fail-closed tenant registry and provisional config", async () => {
  const [registry, config] = await Promise.all([
    readFile(files.registry, "utf8"),
    readFile(files.config, "utf8"),
  ]);

  assert.match(
    registry,
    /export const ACTIVE_TENANT_SLUG\s*=\s*"dinktopia"\s+as const/,
  );
  assert.match(
    registry,
    /const tenantRegistry\s*=\s*\{\s*dinktopia:\s*dinktopiaConfig,?\s*\}\s*as const/s,
  );
  assert.match(
    registry,
    /if\s*\(slug !== ACTIVE_TENANT_SLUG\)\s*\{\s*throw new Error\("Unknown tenant\."\)/s,
  );
  assert.match(
    registry,
    /activeTenant\s*=\s*getTenantConfig\(ACTIVE_TENANT_SLUG\)/,
  );

  assert.match(config, /slug:\s*"dinktopia"/);
  assert.match(config, /locale:\s*"en-PH"/);
  assert.match(config, /currency:\s*"PHP"/);
  assert.match(config, /timezone:\s*"Asia\/Manila"/);
  assert.match(config, /productionDomain:\s*null/);
  assert.match(
    config,
    /activation:\s*\{\s*status:\s*"setup_required",\s*publicBookingEnabled:\s*false,\s*provisional:\s*true/s,
  );
  assert.match(config, /opensAt:\s*"06:00"/);
  assert.match(config, /closesAt:\s*"22:00"/);
  assert.match(config, /minimumHours:\s*1/);
  assert.match(config, /maximumHours:\s*3/);
  assert.match(config, /minimumLeadMinutes:\s*60/);
  assert.match(config, /maximumAdvanceDays:\s*30/);
  assert.match(config, /offPeakHourlyRate:\s*300/);
  assert.match(config, /peakHourlyRate:\s*400/);
  assert.equal((config.match(/slug:\s*"preview-court-0[12]"/g) ?? []).length, 2);
});

test("keeps the browser adapter public-only and tenant UUID free", async () => {
  const [client, booking, manage, managementAdapter, types] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.booking, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.types, "utf8"),
  ]);
  const browserSources = [client, booking, manage, managementAdapter, types].join(
    "\n",
  );
  const environmentNames = [
    ...client.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g),
  ].map((match) => match[1]);

  assert.match(client, /^"use client";/);
  assert.deepEqual(
    [...new Set(environmentNames)].sort(),
    [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    ],
  );
  assert.doesNotMatch(
    browserSources,
    /SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|SUPABASE_SECRET|DATABASE_URL|DATABASE_PASSWORD/i,
  );
  assert.doesNotMatch(browserSources, /\btenantId\b|\btenant_id\b/);
  assert.doesNotMatch(
    client,
    /URLSearchParams|location\.search|localStorage[^\n]*(?:tenant|slug)|sessionStorage[^\n]*(?:tenant|slug)/i,
  );
  assert.ok(
    (client.match(/activeTenant\.identity\.slug/g) ?? []).length >= 8,
    "expected tenant hints to come repeatedly from the fixed registry slug",
  );
  assert.match(client, /"X-Tenant-Slug":\s*activeTenant\.identity\.slug/);
  assert.match(client, /p_tenant_slug:\s*activeTenant\.identity\.slug/);
  assert.match(
    manage,
    /capabilities:\s*isPreview\s*\?\s*previewRoleSessions\[role\]\s*:\s*\[\]/,
  );
  assert.match(managementAdapter, /const session = await currentOwnerSession\(\)/);
  assert.match(managementAdapter, /listManagerBookings\(session\.access_token/);
  assert.match(managementAdapter, /listManagerBlocks\(session\.access_token/);
  assert.doesNotMatch(
    managementAdapter,
    /\bcontext\.(?:tenantSlug|role|capabilities)\b/,
  );
});

test("fails closed when live platform setup or authorization is incomplete", async () => {
  const [client, booking, config, managementAdapter] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.booking, "utf8"),
    readFile(files.config, "utf8"),
    readFile(files.managementAdapter, "utf8"),
  ]);

  assert.match(
    client,
    /return publicSupabaseUrl && publicSupabaseKey \? "live" : "preview"/,
  );
  assert.match(client, /"TENANT_ORIGIN_NOT_REGISTERED"/);
  assert.match(client, /if \(!input\.turnstileToken\)/);
  assert.match(client, /"TURNSTILE_REQUIRED"/);
  assert.match(config, /status:\s*"setup_required"/);
  assert.match(config, /publicBookingEnabled:\s*false/);
  assert.match(
    booking,
    /if \(isLive && !bootstrap\?\.readiness\.publicBookingEnabled\)/,
  );
  assert.match(booking, /if \(isLive && !paymentMethod\)/);
  assert.match(booking, /if \(isLive && !policyVersion\)/);
  assert.match(
    booking,
    /if \(isLive && \(!securitySiteKey \|\| !turnstileTokenValue\)\)/,
  );
  assert.match(
    managementAdapter,
    /if \(platformMode\(\) === "live"\)\s*\{\s*throw new Error\("LIVE_MUTATION_NOT_CONNECTED"\)/s,
  );
});

test("keeps checkout reserve-first and recovers authoritative unpaid holds", async () => {
  const booking = await readFile(files.booking, "utf8");
  const holdStart = booking.indexOf("async createHold(");
  const paymentStart = booking.indexOf("async submitPayment(");
  const lookupStart = booking.indexOf("async findBooking(");

  assert.ok(holdStart >= 0 && paymentStart > holdStart && lookupStart > paymentStart);
  const holdSource = booking.slice(holdStart, paymentStart);
  const paymentSource = booking.slice(paymentStart, lookupStart);

  assert.match(holdSource, /createPlatformBooking\(/);
  assert.doesNotMatch(holdSource, /submitPaymentReceipt\(/);
  assert.match(paymentSource, /bookingStatus\(/);
  assert.match(paymentSource, /submitPaymentReceipt\(/);
  assert.ok(
    paymentSource.indexOf("bookingStatus(") <
      paymentSource.indexOf("submitPaymentReceipt("),
    "expected the server hold to be revalidated before accepting a receipt",
  );

  assert.match(booking, /dinktopia:active-hold/);
  assert.match(booking, /bookingStatus\(pointer\.reference, parsed\.token\)/);
  assert.match(booking, /holdExpired/);
  assert.match(booking, /holdRemainingSeconds/);
  assert.match(booking, /Reserve before you pay/);
  assert.match(booking, /Preview hold only/);
  assert.match(booking, /Do not send money\./);
  assert.match(booking, /do not pay/i);
  assert.match(booking, /Cancel unpaid hold/);
  assert.match(booking, /Choose a new time/);
});

test("renders accessible labels, control states, and announcements", async () => {
  const [customerResponse, managerResponse, booking, manage] = await Promise.all([
    render("/"),
    render("/manage"),
    readFile(files.booking, "utf8"),
    readFile(files.manage, "utf8"),
  ]);
  const [customerHtml, managerHtml] = await Promise.all([
    customerResponse.text(),
    managerResponse.text(),
  ]);

  assert.match(customerHtml, /aria-label="Primary navigation"/i);
  assert.match(customerHtml, /aria-controls="primary-navigation"/i);
  assert.match(customerHtml, /aria-expanded="false"/i);
  assert.match(customerHtml, /aria-label="Booking actions"/i);
  assert.match(customerHtml, /aria-label="Booking progress"/i);
  assert.match(customerHtml, /aria-current="step"/i);
  assert.match(customerHtml, /aria-label="Availability key"/i);
  assert.match(customerHtml, /role="status"[^>]*aria-live="polite"/i);
  assert.match(customerHtml, /<fieldset\b/i);
  assert.match(customerHtml, /<legend>Choose a date<\/legend>/i);
  assert.match(customerHtml, /<legend>Choose a court<\/legend>/i);
  assert.match(customerHtml, /aria-pressed="true"/i);

  assert.match(managerHtml, /aria-label="Management navigation"/i);
  assert.match(managerHtml, /aria-label="Mobile management navigation"/i);
  assert.match(managerHtml, /aria-current="page"/i);
  assert.match(documentText(managerHtml), /Current tenant Dinktopia/i);
  assert.match(managerHtml, /aria-label="Preview search control"/i);
  assert.match(managerHtml, /aria-label="Preview notifications"/i);
  assert.match(managerHtml, /aria-label="Preview account control unavailable"/i);
  assert.match(managerHtml, /role="status"[^>]*aria-live="polite"/i);
  assert.match(managerHtml, /id="permission-note"/i);

  assert.match(booking, /role="alert"/);
  assert.match(booking, /aria-invalid=\{Boolean\(/);
  assert.match(booking, /aria-describedby=\{/);
  assert.match(booking, /aria-live="polite"/);
  assert.match(manage, /<dialog[\s\S]*?aria-labelledby="confirm-title"/);
  assert.match(manage, /role="progressbar"/);
  assert.match(manage, /aria-valuemin=\{0\}/);
  assert.match(manage, /aria-valuemax=\{100\}/);
  assert.match(manage, /aria-pressed=\{/);
});

test("keeps customer and management layouts adaptive from phones to desktop", async () => {
  const [booking, globalsCss, publicCss, manageCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.globalsCss, "utf8"),
    readFile(files.publicCss, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  assert.match(globalsCss, /html\s*\{[^}]*min-width:\s*0/s);
  assert.doesNotMatch(
    globalsCss,
    /body\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/s,
  );
  assert.match(globalsCss, /--text-micro:\s*0\.75rem/);
  assert.match(globalsCss, /--text-caption:\s*0\.75rem/);
  assert.match(globalsCss, /--text-small:\s*0\.875rem/);
  assert.match(globalsCss, /--text-nav:\s*0\.9375rem/);
  assert.match(globalsCss, /--text-body:\s*1rem/);
  assert.match(globalsCss, /--text-title:\s*clamp\(/);
  assert.match(globalsCss, /img\s*\{[^}]*max-width:\s*100%/s);
  assert.match(globalsCss, /:focus-visible\s*\{[^}]*outline:/s);
  assert.match(globalsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  assert.match(
    publicCss,
    /\.site-container\s*\{[^}]*width:\s*min\(1180px,\s*calc\(100% - 32px\)\)/s,
  );
  assert.match(publicCss, /\.button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(publicCss, /\.button-small\s*\{[^}]*min-height:\s*44px/s);
  assert.match(publicCss, /\.text-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(publicCss, /\.mode-switch button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(publicCss, /\.header-inner\s*\{[^}]*min-height:\s*60px/s);
  assert.match(publicCss, /\.hero-grid\s*\{[^}]*padding-top:\s*102px/s);
  assert.match(
    publicCss,
    /\.primary-nav\s*\{[^}]*top:\s*calc\(100% - 1px\)/s,
  );
  assert.match(
    publicCss,
    /\.ticker\s*\{[^}]*min-height:\s*38px/s,
  );
  assert.match(
    publicCss,
    /\.ticker-sequence\s*\{[^}]*width:\s*min\(920px,\s*calc\(100% - 16px\)\)[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[^}]*font-size:\s*clamp\(var\(--text-caption\),\s*2vw,\s*var\(--text-meta\)\)/s,
  );
  assert.match(
    publicCss,
    /\.ticker-sequence\s*>\s*span\s*\{[^}]*animation:\s*dinktopia-ticker-intro 560ms[^}]*both/s,
  );
  assert.match(
    publicCss,
    /\.ticker-sequence\s*>\s*span\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s,
  );
  assert.doesNotMatch(
    booking,
    /tickerPaused|ticker-toggle|Pause moving phrase banner|Play moving phrase banner/,
  );
  assert.doesNotMatch(
    publicCss,
    /\.ticker-toggle|\.ticker\.is-paused|animation:\s*dinktopia-ticker-intro[^;}]*infinite/s,
  );
  assert.match(
    publicCss,
    /@keyframes\s+dinktopia-ticker-intro\s*\{[\s\S]*?opacity:\s*1[\s\S]*?translateY\(0\)/s,
  );
  assert.match(
    publicCss,
    /\.ticker-sequence\s*>\s*span:nth-child\(3\)\s*\{[^}]*animation-delay:\s*180ms/s,
  );
  assert.match(publicCss, /\.preview-ribbon\s*\{[^}]*position:\s*relative/s);
  assert.match(
    publicCss,
    /\.site-header\.has-preview-ribbon\s*\{[^}]*top:\s*auto/s,
  );
  assert.match(
    publicCss,
    /\.menu-button\s*\{[^}]*display:\s*flex[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s,
  );
  assert.match(
    publicCss,
    /\.footer-grid small\s*\{[^}]*font-size:\s*var\(--text-meta\)/s,
  );
  assert.match(
    publicCss,
    /\.footer-bottom\s*\{[^}]*font-size:\s*var\(--text-meta\)/s,
  );
  assert.match(
    publicCss,
    /:where\(\s*\.dinktopia-site button,[\s\S]*?\.dinktopia-site textarea\s*\)\s*\{\s*font:\s*inherit/s,
  );
  assert.match(
    publicCss,
    /\.primary-nav\s*>\s*a,\s*\.primary-nav\s*>\s*button\s*\{[^}]*font-size:\s*var\(--text-body\)[^}]*font-weight:\s*var\(--weight-medium\)/s,
  );
  assert.match(
    publicCss,
    /\.booking-mobile-action\s*\{[^}]*position:\s*sticky/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.header-inner\s*\{[^}]*min-height:\s*64px[^}]*\}[\s\S]*?\.header-inner\s*>\s*\.wordmark\s*\{[^}]*width:\s*164px[^}]*\}[\s\S]*?\.hero-grid\s*\{[^}]*padding-top:\s*120px/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*560px\)[\s\S]*?\.hero-grid\s*\{[^}]*padding-top:\s*116px/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.menu-button\s*\{\s*display:\s*none[\s\S]*?\.primary-nav\s*>\s*a,\s*\.primary-nav\s*>\s*button\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*font-size:\s*var\(--text-nav\)[^}]*line-height:\s*1\.3/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.booking-layout\s*\{[^}]*grid-template-columns:/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.hero-grid\s*\{[^}]*grid-template-columns:[^}]*min-height:\s*720px[^}]*padding-top:\s*84px[^}]*\}[\s\S]*?\.hero-visual\s*\{[^}]*min-height:\s*560px/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(max-width:\s*979\.98px\)[\s\S]*?\.hero-grid\s*\{[^}]*min-height:\s*0[^}]*gap:\s*0[^}]*\}[\s\S]*?\.hero-visual\s*\{[^}]*position:\s*absolute[^}]*min-height:\s*0[^}]*opacity:\s*0\.2[^}]*pointer-events:\s*none[^}]*\}[\s\S]*?\.hero-visual\s*>\s*\.score-card,\s*\.hero-visual\s*>\s*\.floating-note\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    publicCss,
    /\.hero-proof\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(max-width:\s*979\.98px\)\s*and\s*\(prefers-contrast:\s*more\)\s*\{\s*\.hero-visual\s*\{\s*display:\s*none/s,
  );
  assert.ok(
    publicCss.indexOf("@media (max-width: 979.98px)") >
      publicCss.indexOf("@media (min-width: 560px)"),
  );
  assert.match(
    publicCss,
    /@media\s*\(prefers-contrast:\s*more\)[\s\S]*?\.hero-lede\s*\{\s*color:\s*var\(--on-dark\)/s,
  );
  assert.match(publicCss, /@media\s*\(max-width:\s*390px\)/);
  assert.match(
    publicCss,
    /@media\s*\(max-width:\s*390px\)[\s\S]*?\.wordmark\s*\{[^}]*width:\s*128px/s,
  );
  assert.match(publicCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(
    publicCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ticker-sequence\s*>\s*span\s*\{[^}]*opacity:\s*1[^}]*transform:\s*none[^}]*animation:\s*none\s*!important/s,
  );

  assert.match(
    manageCss,
    /\.mobileBrand,\s*\.mobileNav\s*\{\s*display:\s*none/s,
  );
  assert.match(
    manageCss,
    /\.desktopNav p\s*\{[^}]*color:\s*var\(--muted\)[^}]*font-size:\s*var\(--text-caption\)/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.sidebar\s*\{\s*display:\s*none/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.mobileNav\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.signInShell input\s*\{\s*font-size:\s*var\(--text-body\)/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.mobileNav button\s*\{[^}]*font-size:\s*var\(--text-small\)/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.dataTable[^\{]*\{[^}]*display:\s*block/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*430px\)[\s\S]*?\.metricGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(manageCss, /\.dateButton\s*\{[^}]*min-height:\s*59px/s);
  assert.match(
    manageCss,
    /\.slotGrid\s*\{[^}]*grid-template-rows:\s*minmax\(86px,\s*auto\)/s,
  );
  assert.match(
    manageCss,
    /\.slotGrid\s*\{[^}]*grid-template-columns:\s*repeat\(14,\s*5rem\)/s,
  );
  assert.match(
    manageCss,
    /\.hoursList\s*>\s*div\s*>\s*input\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.hoursList\s*>\s*div\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(manageCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  const publicPixelTypeSizes = [
    ...publicCss.matchAll(/font-size:\s*([0-9.]+)px/g),
  ].map((match) => Number(match[1]));
  assert.ok(publicPixelTypeSizes.every((size) => size >= 12));

  const manageRemTypeSizes = [
    ...manageCss.matchAll(/font-size:\s*([0-9.]+)rem/g),
  ].map((match) => Number(match[1]));
  assert.ok(manageRemTypeSizes.every((size) => size >= 0.75));

  for (const css of [publicCss, manageCss]) {
    const numericWeights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map(
      (match) => Number(match[1]),
    );
    assert.ok(
      numericWeights.every((weight) =>
        [400, 500, 600, 700, 800].includes(weight),
      ),
    );
  }
});
