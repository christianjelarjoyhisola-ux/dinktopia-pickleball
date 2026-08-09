import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  booking: new URL("../app/booking-experience.tsx", import.meta.url),
  bookLoading: new URL("../app/book/loading.tsx", import.meta.url),
  bookPage: new URL("../app/book/page.tsx", import.meta.url),
  client: new URL("../app/lib/platform/client.ts", import.meta.url),
  config: new URL("../app/tenants/dinktopia/config.ts", import.meta.url),
  courtsPage: new URL("../app/courts/page.tsx", import.meta.url),
  courtsLoading: new URL("../app/courts/loading.tsx", import.meta.url),
  globalsCss: new URL("../app/globals.css", import.meta.url),
  layout: new URL("../app/layout.tsx", import.meta.url),
  loading: new URL("../app/loading.tsx", import.meta.url),
  manage: new URL("../app/manage/page.tsx", import.meta.url),
  manageLoading: new URL("../app/manage/loading.tsx", import.meta.url),
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
  routeLoadingScreen: new URL(
    "../app/route-loading-screen.tsx",
    import.meta.url,
  ),
  transitionLink: new URL("../app/transition-link.tsx", import.meta.url),
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

function cssBlock(source, prelude) {
  const preludeStart = source.indexOf(prelude);
  assert.ok(preludeStart >= 0, `expected CSS block: ${prelude}`);
  const blockStart = source.indexOf("{", preludeStart + prelude.length);
  assert.ok(blockStart >= 0, `expected opening brace for CSS block: ${prelude}`);

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(blockStart + 1, index);
  }

  assert.fail(`expected closing brace for CSS block: ${prelude}`);
}

test("server-renders named Home, Courts, Book, and Manage routes", async () => {
  const responses = await Promise.all([
    render("/"),
    render("/courts"),
    render("/book?court=preview-court-02"),
    render("/book?court=not-a-court"),
    render("/book?court=one&court=two"),
    render("/book?mode=manage"),
  ]);
  responses.forEach(assertHtmlResponse);
  const [home, courts, selectedBook, invalidBook, repeatedBook, manageBook] =
    await Promise.all(responses.map((response) => response.text()));

  assert.equal(documentTitle(home), "Home · Dinktopia Pickleball");
  assert.equal(documentTitle(courts), "Courts · Dinktopia Pickleball");
  assert.equal(documentTitle(selectedBook), "Book a Court · Dinktopia Pickleball");
  assert.equal(documentTitle(manageBook), "Manage Booking · Dinktopia Pickleball");

  for (const html of [home, courts, selectedBook, invalidBook, repeatedBook, manageBook]) {
    assert.match(html, /<html\b[^>]*\blang="en-PH"/i);
    assert.match(html, /<meta\b[^>]*\bname="robots"[^>]*\bcontent="noindex, nofollow"/i);
    assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i);
    assert.equal(countTags(html, "main"), 1);
    assert.equal(countTags(html, "h1"), 1);
    assert.equal(countTags(html, "header"), 1);
    assert.equal(countTags(html, "footer"), 1);
    assert.match(html, /<main\b[^>]*id="main-content"/i);
    assert.doesNotMatch(html, starterMarkers);
  }

  const homeText = documentText(home);
  assert.match(home, /class="hero-visual"[^>]*aria-hidden="true"/i);
  assert.match(homeText, /Welcome to your next favorite habit/i);
  assert.match(homeText, /Your next rally starts here\./i);
  assert.match(homeText, /From ₱300 per court-hour/i);
  assert.match(homeText, /24\/7 live availability/i);
  assert.match(
    await readFile(files.booking, "utf8"),
    /function getMinimumConfiguredHourlyRate\(courts: PublicCourt\[\]\)[\s\S]*?Math\.min\(\.\.\.rates\)/,
  );
  assert.match(
    home,
    /<a\b(?=[^>]*class="button button-lime button-large")(?=[^>]*href="\/book")[^>]*>\s*Book a court\b/is,
  );
  assert.match(home, /<a\b(?=[^>]*class="text-link")(?=[^>]*href="#how-it-works")/is);
  assert.doesNotMatch(home, /class="court-discovery section-pad"|class="booking-zone section-pad"/i);

  assert.match(home, /Play more\. Rally often\. Stay focused\. New habit\./i);
  assert.match(home, /class="ticker-motion-toggle sr-only"[^>]*type="checkbox"/i);
  assert.match(home, /class="ticker-track"[^>]*aria-hidden="true"/i);
  assert.equal((home.match(/class="ticker-group(?: ticker-group-clone)?"/g) ?? []).length, 2);
  assert.match(home, /PLAY MORE[\s\S]*RALLY OFTEN[\s\S]*STAY FOCUSED[\s\S]*NEW HABIT/i);
  assert.doesNotMatch(home, /<button\b[^>]*(?:ticker|Pause|Resume)/i);

  const tickerStart = home.indexOf('class="ticker"');
  const galleryStart = home.indexOf('class="club-gallery section-pad"');
  const howStart = home.indexOf('class="how-section section-pad"');
  assert.ok(tickerStart >= 0 && galleryStart > tickerStart && howStart > galleryStart);
  const galleryHtml = home.slice(galleryStart, howStart);
  assert.match(galleryHtml, /id="gallery"/i);
  assert.match(galleryHtml, /Court gallery/i);
  assert.match(galleryHtml, /Court photos are coming soon\./i);
  assert.doesNotMatch(galleryHtml, /class="gallery-grid"|<figure\b|<img\b/i);
  assert.match(home, /<a\b[^>]*href="#gallery"[^>]*>Gallery<\/a>/i);

  assert.match(courts, /class="court-discovery section-pad"/i);
  assert.match(courts, /Choose your court\.[\s\S]*Start your rally\./i);
  assert.match(courts, /href="\/book\?court=preview-court-01"/i);
  assert.match(courts, /href="\/book\?court=preview-court-02"/i);
  assert.match(courts, /href="\/book\?court=preview-court-03"/i);
  assert.match(courts, /href="\/book\?court=preview-court-04"/i);
  assert.doesNotMatch(courts, /class="hero"|class="booking-zone section-pad"|class="club-gallery/i);

  assert.match(selectedBook, /class="booking-zone section-pad"/i);
  assert.match(selectedBook, /Book a court/i);
  assert.doesNotMatch(selectedBook, /class="hero"|class="court-discovery section-pad"|class="club-gallery/i);

  assert.match(manageBook, /Manage your booking/i);
  assert.match(manageBook, /Find booking/i);
  assert.doesNotMatch(manageBook, /class="court-discovery section-pad"|class="club-gallery/i);
});

test("uses an atomic, responsive court-hour matrix and fails closed for unsupported live groups", async () => {
  const [bookResponse, booking, publicCss, config] = await Promise.all([
    render("/book"),
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
    readFile(files.config, "utf8"),
  ]);
  assertHtmlResponse(bookResponse);
  const bookHtml = await bookResponse.text();

  assert.match(bookHtml, /<legend\b[^>]*>Choose court-hours<\/legend>/i);
  const renderedSelectionCount = bookHtml.match(
    /<div\b[^>]*class="schedule-selection-count"[^>]*>/i,
  );
  assert.ok(renderedSelectionCount, "expected a rendered selection count");
  assert.match(
    renderedSelectionCount[0],
    /aria-label="0 court-hours selected"/i,
  );
  assert.doesNotMatch(renderedSelectionCount[0], /aria-live=/i);
  assert.doesNotMatch(bookHtml, /<legend>How long\?<\/legend>|class="duration-control"/i);

  const previewStart = config.indexOf("previewCourts: [");
  const previewEnd = config.indexOf("\n  ],", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const previewSource = config.slice(previewStart, previewEnd);
  const previewSlugs = [
    ...previewSource.matchAll(/slug:\s*"(preview-court-\d+)"/g),
  ].map((match) => match[1]);
  const previewIds = [
    ...previewSource.matchAll(/id:\s*"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(previewSlugs, [
    "preview-court-01",
    "preview-court-02",
    "preview-court-03",
    "preview-court-04",
  ]);
  assert.equal(previewIds.length, 4);
  assert.equal(new Set(previewIds).size, 4);

  assert.match(
    booking,
    /const previewCourts:\s*Court\[\]\s*=\s*activeTenant\.previewCourts\.map\(\(court, index\) => \(\{/,
  );
  assert.match(booking, /color:\s*index % 2 === 0 \? "blue" : "coral"/);
  assert.match(
    booking,
    /isLive\s*\?\s*displayCourtsFromPlatform\(bootstrap\?\.courts \?\? \[\]\)\s*:\s*previewCourts/s,
  );
  assert.match(
    booking,
    /return tenantBootstrap\.courts\.map\(\(publicCourt\) => \{[\s\S]*?publicCourt\.opensAt[\s\S]*?publicCourt\.closesAt/s,
  );
  assert.doesNotMatch(
    booking,
    /Two dedicated preview courts|both courts|2 preview courts|Applies to both preview courts/i,
  );
  assert.match(
    booking,
    /className=\{`date-option \$\{selectedDate === date\.iso \? "is-selected" : ""\}`\}[\s\S]*?aria-pressed=\{selectedDate === date\.iso\}[\s\S]*?aria-label=\{date\.long\}/s,
  );
  assert.match(
    booking,
    /<p className="sr-live" aria-live="polite" aria-atomic="true">\{selectionState\.announcement\}<\/p>/,
  );

  const selectionCountStart = booking.indexOf(
    '<div className="schedule-selection-count"',
  );
  const selectionCountEnd = booking.indexOf("</div>", selectionCountStart);
  assert.ok(selectionCountStart >= 0 && selectionCountEnd > selectionCountStart);
  const selectionCountSource = booking.slice(
    selectionCountStart,
    selectionCountEnd + "</div>".length,
  );
  assert.match(
    selectionCountSource,
    /aria-label=\{`\$\{selectedSlots\.length\} court-hour\$\{selectedSlots\.length === 1 \? "" : "s"\} selected`\}/,
  );
  assert.doesNotMatch(selectionCountSource, /aria-live=/);
  assert.match(
    selectionCountSource,
    /<button className=\{selectedSlots\.length \? undefined : "is-placeholder"\}[\s\S]*?disabled=\{!selectedSlots\.length\}[\s\S]*?aria-hidden=\{!selectedSlots\.length\}[\s\S]*?tabIndex=\{selectedSlots\.length \? 0 : -1\}[\s\S]*?onClick=\{clearSelection\}>Clear<\/button>/s,
  );
  assert.doesNotMatch(selectionCountSource, /selectedSlots\.length > 0 &&/);
  assert.match(
    booking,
    /className="schedule-scroll-hint">Scroll sideways to see more courts/,
  );
  assert.doesNotMatch(booking, /className="schedule-scroll-hint">Swipe sideways/i);

  const matrixStart = booking.indexOf('<div className="schedule-scroll"');
  const matrixEnd = booking.indexOf("</table>", matrixStart);
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart);
  const matrixSource = booking.slice(matrixStart, matrixEnd + "</table>".length);
  assert.ok(
    (matrixSource.match(/displayCourts\.map\(\(court\) =>/g) ?? []).length >= 2,
    "expected both schedule headers and row cells to derive from displayCourts",
  );
  assert.match(matrixSource, /scheduleHours\.map\(\(hour\) =>/);
  assert.match(
    matrixSource,
    /schedule\.find\(\(item\) => item\.courtId === court\.id\)\?\.slots\.find\(\(item\) => item\.hour === hour\)/,
  );
  assert.match(matrixSource, /const key = selectionKey\(court\.id, hour\)/);
  assert.match(matrixSource, /const isSelected = selectedKeys\.has\(key\)/);
  assert.match(matrixSource, /const isClosed = !slot/);
  assert.match(matrixSource, /const isBooked = slot\?\.status === "unavailable"/);
  assert.match(matrixSource, /const isUnavailable = isClosed \|\| isBooked/);
  assert.match(matrixSource, /const isDisabled = isUnavailable/);
  assert.match(
    matrixSource,
    /aria-label=\{`Availability for \$\{displayCourts\.length\} courts on \$\{selectedDateDetails\?\.long \?\? selectedDate\}`\}/,
  );
  assert.match(matrixSource, /aria-pressed=\{isSelected\}/);
  assert.match(matrixSource, /disabled=\{isDisabled\}/);
  assert.match(
    matrixSource,
    /onClick=\{\(\) => slot && !isUnavailable && chooseSlot\(court, slot\)\}/,
  );
  assert.match(matrixSource, /is-closed/);
  assert.match(matrixSource, /is-booked/);
  assert.doesNotMatch(matrixSource, /isLimitBlocked|is-limit-blocked|selection limit/i);
  assert.doesNotMatch(matrixSource, /aria-disabled=/);

  const uniqueStart = booking.indexOf("function uniqueSelections(");
  const reducerStart = booking.indexOf("function selectionReducer(", uniqueStart);
  const reducerEnd = booking.indexOf("function canonicalizeSelection(", reducerStart);
  assert.ok(uniqueStart >= 0 && reducerStart > uniqueStart && reducerEnd > reducerStart);
  const uniqueSource = booking.slice(uniqueStart, reducerStart);
  const reducerSource = booking.slice(reducerStart, reducerEnd);
  assert.match(uniqueSource, /const seen = new Set<string>\(\)/);
  assert.match(uniqueSource, /const key = selectionKey\(item\.courtId, item\.startHour\)/);
  assert.match(uniqueSource, /if \(seen\.has\(key\)\) return false/);
  assert.match(uniqueSource, /seen\.add\(key\)/);
  assert.match(reducerSource, /items: uniqueSelections\(action\.items\)/);
  assert.match(reducerSource, /const items = uniqueSelections\(state\.items\)/);
  assert.match(
    reducerSource,
    /const key = selectionKey\(action\.item\.courtId, action\.item\.startHour\)/,
  );
  assert.match(
    reducerSource,
    /const isSelected = items\.some\([\s\S]*?selectionKey\(item\.courtId, item\.startHour\) === key[\s\S]*?\)/,
  );
  assert.match(
    reducerSource,
    /action\.liveMode[\s\S]*?action\.liveMaximumHours !== undefined[\s\S]*?items\.length >= action\.liveMaximumHours/,
  );
  assert.doesNotMatch(reducerSource, /action\.maximum|select up to/i);
  assert.match(reducerSource, /if \(action\.liveMode && items\.length > 0\)/);
  assert.match(
    reducerSource,
    /const orderedHours = items[\s\S]*?\.filter\(\(item\) => item\.courtId === action\.item\.courtId\)[\s\S]*?\.map\(\(item\) => item\.startHour\)[\s\S]*?\.sort\(\(left, right\) => left - right\)/,
  );
  assert.match(
    reducerSource,
    /const sameCourt = orderedHours\.length === items\.length/,
  );
  assert.match(
    reducerSource,
    /const extendsRun = sameCourt && \([\s\S]*?action\.item\.startHour === orderedHours\[0\] - 1[\s\S]*?action\.item\.startHour === orderedHours\.at\(-1\)! \+ 1[\s\S]*?\)/,
  );
  assert.match(
    reducerSource,
    /const removesEdge = sameCourt && isSelected && \([\s\S]*?action\.item\.startHour === orderedHours\[0\][\s\S]*?action\.item\.startHour === orderedHours\.at\(-1\)[\s\S]*?\)/,
  );
  assert.match(
    reducerSource,
    /if \(\(!isSelected && !extendsRun\) \|\| \(isSelected && !removesEdge\)\)\s*\{[\s\S]*?items,[\s\S]*?Live checkout accepts consecutive hours on one court/s,
  );
  assert.match(
    reducerSource,
    /const nextItems = isSelected[\s\S]*?items\.filter\([\s\S]*?: \[\.\.\.items, action\.item\]/,
  );
  assert.doesNotMatch(reducerSource, /selectedKeys|selectedSlots|setSelectedSlots/);
  assert.match(
    booking,
    /const \[selectionState, dispatchSelection\] = useReducer\(selectionReducer,/,
  );
  assert.doesNotMatch(booking, /useState<BookingSelection\[\]>|setSelectedSlots/);

  const toggleStart = booking.indexOf("function chooseSlot(");
  const toggleEnd = booking.indexOf("function clearSelection(", toggleStart);
  assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
  const toggleSource = booking.slice(toggleStart, toggleEnd);
  assert.match(
    toggleSource,
    /dispatchSelection\(\{[\s\S]*?type: "toggle"[\s\S]*?courtId: court\.id[\s\S]*?startHour: slot\.hour[\s\S]*?durationHours: 1[\s\S]*?liveMode: isLive,[\s\S]*?liveMaximumHours/s,
  );
  assert.doesNotMatch(toggleSource, /maximumCourtHoursPerCheckout/);
  assert.doesNotMatch(toggleSource, /selectedKeys|selectedSlots|setSelectedSlots/);
  assert.doesNotMatch(booking, /<legend>How long\?<\/legend>|className="duration-control"/);

  const chooseDateStart = booking.indexOf("function chooseDate(");
  const chooseDateEnd = booking.indexOf("function validateDetails(", chooseDateStart);
  assert.ok(chooseDateStart >= 0 && chooseDateEnd > chooseDateStart);
  const chooseDateSource = booking.slice(chooseDateStart, chooseDateEnd);
  assert.match(
    chooseDateSource,
    /dispatchSelection\(\{ type: "clear", announcement: resetMessage \}\)/,
  );
  assert.match(
    chooseDateSource,
    /setSchedule\(\[\]\);\s*setScheduleDate\(""\);\s*setAvailabilityState\("loading"\);\s*setSelectedDate\(date\);/s,
  );
  assert.doesNotMatch(
    chooseDateSource,
    /selectedSlots\.length[\s\S]*?return;[\s\S]*?setSelectedDate/,
  );
  assert.match(
    booking,
    /const visibleAvailabilityState =\s*scheduleDate === selectedDate \? availabilityState : "loading";/s,
  );
  assert.match(
    booking,
    /setSchedule\(nextSchedule\);\s*setScheduleDate\(selectedDate\);/s,
  );
  const availabilityMarkupStart = booking.indexOf(
    '{visibleAvailabilityState === "loading"',
  );
  const availabilityMarkupEnd = booking.indexOf(
    "{isLive && selectedSlots.length",
    availabilityMarkupStart,
  );
  assert.ok(
    availabilityMarkupStart >= 0 && availabilityMarkupEnd > availabilityMarkupStart,
  );
  const availabilityMarkup = booking.slice(
    availabilityMarkupStart,
    availabilityMarkupEnd,
  );
  assert.ok(
    (availabilityMarkup.match(/visibleAvailabilityState ===/g) ?? []).length >= 5,
    "expected every schedule state to use only availability for the selected date",
  );
  assert.doesNotMatch(availabilityMarkup, /\{availabilityState ===/);

  const summaryStart = booking.indexOf("function BookingSummary(");
  const summaryEnd = booking.indexOf("type ManageBookingProps", summaryStart);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
  const summarySource = booking.slice(summaryStart, summaryEnd);
  assert.match(summarySource, /groupSelectionDetails\(selections\)/);
  assert.match(summarySource, /new Set\(selections\.map\(\(item\) => item\.court\.id\)\)\.size/);
  assert.match(summarySource, /COURT-HOURS/);
  assert.match(summarySource, /className="summary-sessions" aria-label="Selected sessions"/);
  assert.match(summarySource, /groups\.map\(\(group\) =>/);
  assert.match(summarySource, /group\.court\.name/);
  assert.match(summarySource, /group\.courtHours/);

  const canonicalStart = booking.indexOf("function canonicalizeSelection(");
  const canonicalEnd = booking.indexOf("function groupSelectionDetails(", canonicalStart);
  assert.ok(canonicalStart >= 0 && canonicalEnd > canonicalStart);
  const canonicalSource = booking.slice(canonicalStart, canonicalEnd);
  assert.match(canonicalSource, /item\.courtId === courtId/);
  assert.match(canonicalSource, /item\.durationHours === 1/);
  assert.match(
    canonicalSource,
    /item\.startHour === ordered\[index - 1\]\.startHour \+ 1/,
  );
  assert.match(canonicalSource, /if \(!isOneConsecutiveCourt\) return null/);

  const holdStart = booking.indexOf("async createHold(");
  const paymentStart = booking.indexOf("async submitPayment(", holdStart);
  assert.ok(holdStart >= 0 && paymentStart > holdStart);
  const holdSource = booking.slice(holdStart, paymentStart);
  assert.match(
    holdSource,
    /if \(platformMode\(\) === "live" && !canonicalSelection\)\s*\{\s*throw new Error\(/s,
  );
  assert.match(holdSource, /atomic group hold/);
  assert.match(holdSource, /no partial reservations were created/);
  assert.ok(
    holdSource.indexOf('platformMode() === "live" && !canonicalSelection') <
      holdSource.indexOf("createPlatformBooking("),
    "expected unsupported live groups to fail before any hold request",
  );

  const reserveStart = booking.indexOf("async function reservePaymentHold(");
  const reserveEnd = booking.indexOf("async function submitPayment(", reserveStart);
  assert.ok(reserveStart >= 0 && reserveEnd > reserveStart);
  const reserveSource = booking.slice(reserveStart, reserveEnd);
  assert.match(
    reserveSource,
    /if \(isLive && !canonicalSelection\)\s*\{[\s\S]*?no partial reservation will be created\.[\s\S]*?return;/s,
  );
  assert.ok(
    reserveSource.indexOf("isLive && !canonicalSelection") <
      reserveSource.indexOf("adapter.createHold("),
    "expected the UI to reject unsupported live groups before calling its adapter",
  );

  const scheduleScrollRules = [
    ...publicCss.matchAll(/(?:^|\n)\s*\.schedule-scroll\s*\{([^}]*)\}/g),
  ].map((match) => match[1]);
  assert.ok(scheduleScrollRules.length >= 1, "expected schedule-scroll styles");
  const scheduleScrollBase = scheduleScrollRules[0];
  assert.match(scheduleScrollBase, /max-height:\s*none/);
  assert.match(scheduleScrollBase, /overflow-x:\s*auto/);
  assert.match(scheduleScrollBase, /overflow-y:\s*visible/);
  assert.match(scheduleScrollBase, /touch-action:\s*pan-x pan-y/);
  const scheduleMaxHeights = scheduleScrollRules.flatMap((rule) =>
    [...rule.matchAll(/max-height:\s*([^;}]+)/g)].map((match) => match[1].trim()),
  );
  assert.deepEqual(
    scheduleMaxHeights,
    ["none"],
    "the schedule must not create a nested vertical max-height scroller",
  );
  assert.doesNotMatch(scheduleScrollRules.join("\n"), /\boverflow:\s*auto/);
  assert.match(
    publicCss,
    /\.schedule-matrix[^\{]*\{[^}]*min-width:/s,
  );
  assert.match(
    publicCss,
    /\.schedule-matrix tbody th\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s,
  );

  const scheduleCellRules = [
    ...publicCss.matchAll(/(?:^|\n)\s*\.schedule-cell\s*\{([^}]*)\}/g),
  ].map((match) => match[1]);
  assert.ok(scheduleCellRules.length >= 1, "expected schedule-cell styles");
  for (const rule of scheduleCellRules) {
    const width = rule.match(/min-width:\s*([0-9.]+)px/);
    const height = rule.match(/min-height:\s*([0-9.]+)px/);
    assert.ok(width && Number(width[1]) >= 48, "expected 48px-wide schedule targets");
    assert.ok(height && Number(height[1]) >= 48, "expected 48px-tall schedule targets");
  }
  const baseScheduleCell = scheduleCellRules[0];
  assert.match(baseScheduleCell, /border:\s*1px solid var\(--line\)/);
  assert.match(baseScheduleCell, /border-radius:\s*(?:[89]|[1-9][0-9]+)px/);
  assert.match(baseScheduleCell, /background:\s*var\(--white\)/);
  assert.match(baseScheduleCell, /touch-action:\s*manipulation/);
  const selectedCellRule = publicCss.match(/\.schedule-cell\.is-selected\s*\{([^}]*)\}/s);
  assert.ok(selectedCellRule, "expected a selected schedule tile state");
  assert.match(selectedCellRule[1], /border-color:/);
  assert.match(selectedCellRule[1], /background:\s*#e8ffd2/);
  assert.match(selectedCellRule[1], /box-shadow:/);
  assert.match(
    publicCss,
    /\.schedule-cell\.is-selected \.schedule-cell-mark\s*\{[^}]*border-radius:\s*50%[^}]*background:\s*var\(--ink\)[^}]*color:\s*var\(--lime\)/s,
  );
  assert.match(
    publicCss,
    /\.schedule-selection-count button\.is-placeholder\s*\{[^}]*visibility:\s*hidden[^}]*pointer-events:\s*none/s,
  );

  assert.equal(
    (booking.match(/className="booking-mobile-action"/g) ?? []).length,
    1,
    "expected one mobile selection dock",
  );
  assert.match(
    booking,
    /\{selectedSlots\.length > 0 && \([\s\S]*?className="booking-mobile-action"[\s\S]*?className="mobile-selection-clear"[\s\S]*?data-testid="booking-continue"/s,
  );
  assert.match(
    booking,
    /className=\{`booking-summary\$\{actionLabel \? " booking-summary-selection" : ""\}`\}/,
  );
  const mobileDockRule = publicCss.match(/\.booking-mobile-action\s*\{([^}]*)\}/s);
  assert.ok(mobileDockRule, "expected mobile dock styles");
  assert.match(mobileDockRule[1], /position:\s*fixed/);
  assert.match(mobileDockRule[1], /bottom:\s*max\(12px, env\(safe-area-inset-bottom\)\)/);
  const mobileSummaryRule = publicCss.match(/\.booking-summary-selection\s*\{([^}]*)\}/s);
  assert.ok(mobileSummaryRule, "expected mobile selection-summary styles");
  assert.match(mobileSummaryRule[1], /display:\s*none/);
  assert.match(
    publicCss,
    /@media \(min-width:\s*980px\)\s*\{[\s\S]*?\.booking-summary-selection\s*\{\s*display:\s*block;?\s*\}[\s\S]*?\.booking-mobile-action\s*\{\s*display:\s*none;?\s*\}/s,
  );

  for (const [selector, expectedDimensions] of [
    ["date-option", ["min-width", "min-height"]],
    ["mobile-selection-clear", ["min-width", "min-height"]],
  ]) {
    const rule = publicCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, "s"));
    assert.ok(rule, `expected ${selector} styles`);
    for (const dimension of expectedDimensions) {
      const size = rule[1].match(new RegExp(`${dimension}:\\s*([0-9.]+)px`));
      assert.ok(
        size && Number(size[1]) >= 48,
        `expected ${selector} ${dimension} to be at least 48px`,
      );
    }
  }
  assert.match(
    publicCss,
    /\.booking-mobile-action \.button\s*\{[^}]*min-height:\s*(?:4[89]|[5-9][0-9]|[1-9][0-9]{2,})px/s,
  );
});

test("uses a branded, accessible pickleball loader only for route transitions", async () => {
  const [
    booking,
    transitionLink,
    loadingScreen,
    rootLoading,
    bookLoading,
    courtsLoading,
    manageLoading,
    globalsCss,
  ] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.transitionLink, "utf8"),
    readFile(files.routeLoadingScreen, "utf8"),
    readFile(files.loading, "utf8"),
    readFile(files.bookLoading, "utf8"),
    readFile(files.courtsLoading, "utf8"),
    readFile(files.manageLoading, "utf8"),
    readFile(files.globalsCss, "utf8"),
  ]);

  assert.match(
    booking,
    /import \{ TransitionLink as Link \} from "\.\/transition-link";/,
  );
  assert.doesNotMatch(booking, /import Link from "next\/link"/);
  assert.match(transitionLink, /^"use client";/);
  assert.match(transitionLink, /NextLink, \{ useLinkStatus \} from "next\/link"/);
  assert.match(transitionLink, /createPortal\(/);
  assert.match(transitionLink, /<RouteLoadingScreen source="link" \/>/);
  assert.match(transitionLink, /portalRoot/);
  assert.match(transitionLink, /document\.body/);
  assert.match(transitionLink, /className="route-loading-portal"/);
  assert.match(transitionLink, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(
    transitionLink,
    /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/,
  );
  assert.doesNotMatch(
    transitionLink,
    /addEventListener|setTimeout|setInterval|dataset\.routeLoading|useEffect/,
  );

  assert.match(loadingScreen, /className="route-loading-screen"/);
  assert.match(loadingScreen, /data-loading-source=\{source\}/);
  assert.match(loadingScreen, /role="status"/);
  assert.match(loadingScreen, /aria-live="polite"/);
  assert.match(loadingScreen, /aria-atomic="true"/);
  assert.doesNotMatch(loadingScreen, /aria-busy/);
  assert.match(loadingScreen, /className="route-loading-court" aria-hidden="true"/);
  assert.match(loadingScreen, /Loading your next rally…/);
  assert.match(loadingScreen, /Getting the court ready\./);
  assert.doesNotMatch(
    loadingScreen,
    /<a\b|<button\b|<input\b|<select\b|<textarea\b|tabIndex|autoFocus/,
  );

  for (const boundary of [
    rootLoading,
    bookLoading,
    courtsLoading,
    manageLoading,
  ]) {
    assert.match(boundary, /<RouteLoadingScreen \/>/);
    assert.doesNotMatch(
      boundary,
      /"use client"|window\.|document\.|setTimeout|fetch\(/,
    );
  }

  assert.match(
    globalsCss,
    /\.route-loading-screen\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*12000[^}]*inset:\s*0[^}]*min-height:\s*100dvh/s,
  );
  assert.match(
    globalsCss,
    /body:has\(> \.route-loading-portal\)[\s\S]*?\.route-loading-screen\[data-loading-source="boundary"\]\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    globalsCss,
    /\.route-loading-card\s*\{[^}]*width:\s*min\(320px,\s*100%\)[^}]*border-radius:\s*28px/s,
  );
  assert.match(
    globalsCss,
    /\.route-loading-ball\s*\{[^}]*width:\s*clamp\(52px,\s*15vw,\s*64px\)[^}]*radial-gradient[\s\S]*?animation:\s*dinktopia-ball-roll 760ms linear infinite/s,
  );
  assert.match(
    globalsCss,
    /@keyframes\s+dinktopia-ball-roll\s*\{\s*to\s*\{\s*transform:\s*rotate\(360deg\)/s,
  );
  assert.match(
    globalsCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.route-loading-ball-wrap,[\s\S]*?\.route-loading-ball,[\s\S]*?\.route-loading-shadow\s*\{[^}]*animation:\s*none\s*!important[^}]*transform:\s*none\s*!important[^}]*will-change:\s*auto/s,
  );
});

test("keeps the court gallery tenant-sourced, safe, compact, and responsive", async () => {
  const [booking, publicCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
  ]);

  const allowlistStart = booking.indexOf("function trustedGallerySource");
  const galleryDataEnd = booking.indexOf("const seededCustomer", allowlistStart);
  assert.ok(allowlistStart >= 0 && galleryDataEnd > allowlistStart);
  const galleryDataSource = booking.slice(allowlistStart, galleryDataEnd);

  assert.match(galleryDataSource, /if \(!tenantBootstrap\) return \[\]/);
  assert.match(
    galleryDataSource,
    /source\.startsWith\("\/"\)\s*&&\s*!source\.startsWith\("\/\/"\)/s,
  );
  assert.match(galleryDataSource, /const localOrigin = "https:\/\/dinktopia\.invalid"/);
  assert.match(galleryDataSource, /new URL\(source, localOrigin\)/);
  assert.match(galleryDataSource, /localUrl\.origin === localOrigin/);
  assert.match(
    galleryDataSource,
    /return `\$\{localUrl\.pathname\}\$\{localUrl\.search\}\$\{localUrl\.hash\}`/,
  );
  assert.ok(
    (galleryDataSource.match(/source\.includes\("\\\\"\)/g) ?? []).length >= 2,
    "expected both local and remote gallery URLs to reject backslashes",
  );
  assert.match(galleryDataSource, /!\/\^https:\\\/\\\/\/i\.test\(source\)/);
  assert.match(galleryDataSource, /url\.protocol === "https:"/);
  assert.match(
    galleryDataSource,
    /!url\.username\s*&&\s*!url\.password\s*&&\s*!url\.port/s,
  );
  assert.match(
    galleryDataSource,
    /url\.hostname\.endsWith\("\.supabase\.co"\)/,
  );
  assert.match(
    galleryDataSource,
    /url\.pathname\.includes\("\/storage\/v1\/object\/"\)/,
  );
  assert.match(
    galleryDataSource,
    /const config = \(court\.publicConfig \?\? \{\}\) as/,
  );
  assert.match(galleryDataSource, /const src = trustedGallerySource\(config\.photoUrl\)/);
  assert.match(galleryDataSource, /if \(!src\) return \[\]/);
  assert.match(
    galleryDataSource,
    /function galleryText\(value: unknown, fallback: string, maxLength: number\)/,
  );
  assert.ok(
    galleryDataSource.includes(
      'const normalized = value.trim().replace(/\\s+/g, " ");',
    ),
  );
  assert.match(
    galleryDataSource,
    /return normalized \? normalized\.slice\(0, maxLength\) : fallback/,
  );
  assert.match(
    galleryDataSource,
    /alt:\s*galleryText\([\s\S]*?config\.photoAlt,[\s\S]*?180,[\s\S]*?\)/s,
  );
  assert.match(
    galleryDataSource,
    /caption:\s*galleryText\(config\.photoCaption, court\.name, 80\)/,
  );
  assert.match(galleryDataSource, /\.slice\(0, 5\)/);
  assert.doesNotMatch(
    galleryDataSource,
    /data:|blob:|localStorage|sessionStorage|FileReader|createObjectURL/i,
  );

  const galleryMarkupStart = booking.indexOf(
    '<section className="club-gallery section-pad"',
  );
  const galleryMarkupEnd = booking.indexOf(
    "\n\n  return (",
    galleryMarkupStart,
  );
  assert.ok(galleryMarkupStart >= 0 && galleryMarkupEnd > galleryMarkupStart);
  const galleryMarkup = booking.slice(galleryMarkupStart, galleryMarkupEnd);

  assert.match(
    booking,
    /const gallerySection = \(\s*<section className="club-gallery section-pad"/s,
  );
  assert.match(
    booking,
    /\{isHome && gallerySection\}/,
  );
  assert.match(booking, /<Link href="\/#gallery">Gallery<\/Link>/);
  assert.match(galleryMarkup, /galleryPhotos\.length \? \(/);
  assert.ok(
    galleryMarkup.includes(
      'className={`gallery-grid${galleryPhotos.length === 5 ? " is-bento" : ""}`}',
    ),
    "expected only a complete five-photo set to opt into the bento mosaic",
  );
  assert.doesNotMatch(
    galleryMarkup,
    /galleryPhotos\.length\s*(?:>|>=|<|<=)\s*5\s*\?\s*" is-bento"/,
  );
  assert.match(
    galleryMarkup,
    /<img[\s\S]*?src=\{photo\.src\}[\s\S]*?alt=\{photo\.alt\}[\s\S]*?width=\{1200\}[\s\S]*?height=\{900\}[\s\S]*?loading="lazy"[\s\S]*?decoding="async"[\s\S]*?\/>/s,
  );
  assert.match(
    galleryMarkup,
    /aria-label="Dinktopia court gallery"\s*role="region"\s*tabIndex=\{0\}/s,
  );
  assert.match(galleryMarkup, /<figcaption>\{photo\.caption\}<\/figcaption>/);
  assert.match(galleryMarkup, /className="gallery-empty"/);
  assert.match(galleryMarkup, /aria-hidden="true"/);
  assert.doesNotMatch(
    galleryMarkup,
    /type="file"|localStorage|sessionStorage|FileReader|createObjectURL/i,
  );

  assert.match(
    publicCss,
    /\.gallery-grid\s*\{[^}]*grid-auto-columns:\s*min\(78vw,\s*340px\)[^}]*grid-auto-flow:\s*column[^}]*overflow-x:\s*auto[^}]*scroll-snap-type:\s*x mandatory/s,
  );
  assert.match(
    publicCss,
    /\.gallery-card\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10[^}]*scroll-snap-align:\s*start/s,
  );
  assert.match(
    publicCss,
    /\.gallery-heading h2\s*\{[^}]*font-size:\s*var\(--text-section\)[^}]*font-weight:\s*var\(--weight-bold\)[^}]*letter-spacing:\s*var\(--tracking-heading\)[^}]*line-height:\s*0\.96/s,
  );
  assert.match(
    publicCss,
    /\.gallery-card figcaption\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*display:\s*-webkit-box[^}]*overflow:\s*hidden[^}]*-webkit-box-orient:\s*vertical[^}]*-webkit-line-clamp:\s*2/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.gallery-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*overflow:\s*visible/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.gallery-grid:not\(\.is-bento\)\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.gallery-grid \.gallery-card:only-child\s*\{[^}]*width:\s*min\(760px,\s*100%\)[^}]*grid-column:\s*1\s*\/\s*-1[^}]*justify-self:\s*center[^}]*aspect-ratio:\s*16\s*\/\s*7/s,
  );
  assert.doesNotMatch(publicCss, /repeat\(auto-fill,\s*minmax\(260px,/);
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.gallery-grid\.is-bento\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*grid-template-rows:\s*repeat\(2,\s*clamp\(170px,\s*16vw,\s*205px\)\)[^}]*\}[\s\S]*?\.gallery-grid\.is-bento \.gallery-card:first-child\s*\{[^}]*grid-column:\s*span 2[^}]*grid-row:\s*span 2/s,
  );
  assert.doesNotMatch(
    publicCss,
    /\.gallery-grid(?!\.is-bento|:not\()\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s,
  );
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
  assert.match(customerHtml, /href="\/courts"/i);
  assert.doesNotMatch(customerHtml, /class="booking-zone section-pad"/i);

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
  const [booking, config, globalsCss, layout, manage, manageCss, publicCss, logo, og, homeResponse, manageResponse] =
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
      render("/"),
      render("/manage"),
    ]);
  assertHtmlResponse(homeResponse);
  assertHtmlResponse(manageResponse);
  const [homeHtml, manageHtml] = await Promise.all([
    homeResponse.text(),
    manageResponse.text(),
  ]);

  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(logo.readUInt32BE(16), 2046);
  assert.equal(logo.readUInt32BE(20), 769);
  assert.equal(logo[25], 6, "expected the public logo PNG to retain RGBA transparency");
  const customerLogoTags = (booking.match(/<Image\b[\s\S]*?\/>/g) ?? [])
    .filter((tag) => tag.includes('src="/dinktopia-logo.png"'));
  const managerLogoTags = (manage.match(/<Image\b[\s\S]*?\/>/g) ?? [])
    .filter((tag) => tag.includes('src="/dinktopia-logo.png"'));
  assert.equal(customerLogoTags.length, 2);
  assert.equal(managerLogoTags.length, 3);
  for (const tag of [...customerLogoTags, ...managerLogoTags]) {
    assert.match(tag, /\bunoptimized\b/);
    assert.match(tag, /\balt=""/);
    assert.match(tag, /\bwidth=\{2046\}/);
    assert.match(tag, /\bheight=\{769\}/);
  }
  assert.equal((booking.match(/aria-label="Dinktopia home"/g) ?? []).length, 2);
  assert.equal(
    (manage.match(/<span className=\{styles\.srOnly\}>DINKTOPIA<\/span>/g) ?? []).length,
    3,
  );
  const renderedLogoTags = [homeHtml, manageHtml].flatMap(
    (html) => html.match(/<img\b[^>]*dinktopia-logo\.png[^>]*>/gi) ?? [],
  );
  assert.equal(renderedLogoTags.length, 4);
  for (const tag of renderedLogoTags) {
    assert.match(tag, /src="\/dinktopia-logo\.png"/i);
    assert.match(tag, /alt=""/i);
    assert.match(tag, /width="2046"/i);
    assert.match(tag, /height="769"/i);
    assert.doesNotMatch(tag, /\/_vinext\/image/i);
  }
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
  assert.match(config, /productionDomain:\s*"dinktopia\.pages\.dev"/);
  assert.match(
    config,
    /activation:\s*\{\s*status:\s*"setup_required",\s*publicBookingEnabled:\s*false,\s*provisional:\s*true/s,
  );
  assert.match(config, /opensAt:\s*"06:00"/);
  assert.match(config, /closesAt:\s*"22:00"/);
  assert.match(config, /minimumHours:\s*1/);
  assert.match(config, /maximumHours:\s*3/);
  assert.doesNotMatch(config, /maximumCourtHoursPerCheckout/);
  assert.match(config, /minimumLeadMinutes:\s*60/);
  assert.match(config, /maximumAdvanceDays:\s*30/);
  assert.match(config, /offPeakHourlyRate:\s*300/);
  assert.match(config, /peakHourlyRate:\s*400/);
  assert.equal((config.match(/slug:\s*"preview-court-0[1-4]"/g) ?? []).length, 4);
});

test("keeps the browser adapter public-only, origin-bound, and tenant UUID free", async () => {
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
  assert.match(
    client,
    /const SHARED_SUPABASE_ORIGIN = "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/,
  );
  assert.match(
    client,
    /const REGISTERED_MANAGEMENT_ORIGIN = "https:\/\/dinktopia\.pages\.dev"/,
  );
  assert.match(
    client,
    /publishableKey && url\.origin === SHARED_SUPABASE_ORIGIN[\s\S]*?url\.protocol === "https:"[\s\S]*?!url\.username && !url\.password/,
  );
  assert.match(client, /jwtRole\(publicSupabaseKey\) === "anon"/);
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
    client,
    /if \(options\.mutation && origin !== REGISTERED_MANAGEMENT_ORIGIN\)/,
  );
  assert.match(
    client,
    /"get_my_tenant_session"[\s\S]*?p_tenant_slug:\s*activeTenant\.identity\.slug,[\s\S]*?p_hostname:\s*managementHostname\(\)/,
  );

  for (const wrapper of [
    "getManagerCourts",
    "getBlockedDateAccess",
    "manageTenantCourt",
    "applySharedCourtSchedule",
    "manageBlockedDates",
    "updateBusinessSettings",
    "updateActivationSettings",
    "activateTenantInitially",
  ]) {
    assert.match(
      client,
      new RegExp(`export async function ${wrapper}\\b`),
      `expected the supported ${wrapper} live wrapper`,
    );
  }

  assert.match(
    manage,
    /capabilities:\s*isPreview\s*\?\s*previewRoleSessions\[role\]\s*:\s*snapshot\?\.session\.capabilities \?\? \[\]/,
  );
  assert.ok(
    (managementAdapter.match(/const session = await currentOwnerSession\(\)/g) ?? [])
      .length >= 2,
    "expected both live reads and writes to require a current authenticated session",
  );
  assert.ok(
    (managementAdapter.match(/await getManagerSession\(session\.access_token\)/g) ?? [])
      .length >= 2,
    "expected both live reads and writes to re-derive authority from the server session",
  );
  assert.match(
    managementAdapter,
    /const capabilities = liveCapabilities\(\{[\s\S]*?session:\s*serverSession,[\s\S]*?canManageVenueSettings:[\s\S]*?canManageBlocks:[\s\S]*?canActivatePublicBooking:/,
  );
  assert.match(
    managementAdapter,
    /const isSystemOwner = serverRole === "owner" && membershipRole === null/,
  );
  assert.match(
    managementAdapter,
    /if \(options\.session\.isSystemOwner && options\.canActivatePublicBooking\)[\s\S]*?capabilities\.push\("tenant:publish"\)/,
  );
  assert.match(managementAdapter, /listManagerBookings\(session\.access_token/);
  assert.match(managementAdapter, /listManagerBlocks\(session\.access_token/);
  assert.match(
    managementAdapter,
    /action\.type === "court:create"[\s\S]*?manageTenantCourt\(session\.access_token/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "settings:schedule"[\s\S]*?applySharedCourtSchedule\(/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "schedule:block"[\s\S]*?manageBlockedDates\(session\.access_token/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "business:update"[\s\S]*?updateBusinessSettings\(\s*session\.access_token/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "tenant:publish"[\s\S]*?!authority\.isSystemOwner[\s\S]*?activateTenantInitially\(session\.access_token\)/,
  );
  assert.match(managementAdapter, /throw new Error\("LIVE_ACTION_UNSUPPORTED"\)/);
  assert.doesNotMatch(
    managementAdapter,
    /\bcontext\.(?:role|capabilities)\b/,
  );
  assert.doesNotMatch(managementAdapter, /LIVE_MUTATION_NOT_CONNECTED/);
});

test("protects live business and payment settings from stale or unsafe writes", async () => {
  const [client, manage, managementAdapter] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
  ]);

  assert.match(
    managementAdapter,
    /export type BusinessPaymentConfiguration = \{\s*revision:\s*string;/,
  );
  assert.match(
    managementAdapter,
    /const rootUpdatedAt = value\(settings, \["updatedAt"\]\);[\s\S]*?revision:\s*rootUpdatedAt/,
  );
  assert.match(
    manage,
    /expectedRevision:\s*snapshot\.configuration\.businessPayments!\.revision/,
  );
  assert.match(
    managementAdapter,
    /const businessAction = action\.type === "business:update"[\s\S]*?businessActionPayload\(action\.payload\)[\s\S]*?const patch = businessAction\?\.patch/,
  );
  assert.match(
    managementAdapter,
    /const patch = \{ \.\.\.payload \};\s*delete patch\.expectedRevision;[\s\S]*?expectedRevision,[\s\S]*?patch:\s*settingsPatch\(patch, "business:update"\)/,
  );
  assert.match(
    managementAdapter,
    /updateBusinessSettings\([\s\S]*?session\.access_token,[\s\S]*?businessAction!\.expectedRevision,[\s\S]*?patch/,
  );
  assert.match(
    client,
    /"update_tenant_business_settings_if_current"[\s\S]*?p_tenant_slug:\s*activeTenant\.identity\.slug,[\s\S]*?p_hostname:\s*managementHostname\(\{ mutation: true \}\),[\s\S]*?p_expected_revision:\s*expectedRevision,[\s\S]*?p_patch:\s*patch/,
  );
  assert.match(
    client,
    /error\.code === "40001" \|\| error\.message\.includes\("BUSINESS_SETTINGS_STALE"\)[\s\S]*?"SETTINGS_STALE_REFRESH_REQUIRED"[\s\S]*?Refresh before saving again\./,
  );
  assert.match(
    manage,
    /error\.code === "SETTINGS_STALE_REFRESH_REQUIRED"[\s\S]*?tone:\s*error\.code === "SETTINGS_STALE_REFRESH_REQUIRED"[\s\S]*?"warning"/,
  );

  const qrAllowlistStart = managementAdapter.indexOf(
    "export function isAllowedCustomerQrUrl(",
  );
  const qrAllowlistEnd = managementAdapter.indexOf(
    "function assertDinktopiaContext(",
    qrAllowlistStart,
  );
  assert.ok(qrAllowlistStart >= 0 && qrAllowlistEnd > qrAllowlistStart);
  const qrAllowlist = managementAdapter.slice(qrAllowlistStart, qrAllowlistEnd);
  assert.doesNotMatch(managementAdapter, /REGISTERED_DINKTOPIA_ORIGIN/);
  assert.match(
    managementAdapter,
    /const SHARED_SUPABASE_ORIGIN = "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/,
  );
  assert.match(
    managementAdapter,
    /const PUBLIC_PAYMENT_ASSET_PREFIX =\s*"\/storage\/v1\/object\/public\/tenant-public-assets\/"/,
  );
  assert.match(
    qrAllowlist,
    /const absolutePrefix = `\$\{SHARED_SUPABASE_ORIGIN\}\$\{PUBLIC_PAYMENT_ASSET_PREFIX\}`/,
  );
  assert.match(
    qrAllowlist,
    /!candidate \|\| candidate\.length > 500 \|\| candidate\.includes\("\\\\"\) \|\|\s*!candidate\.startsWith\(absolutePrefix\) \|\| candidate\.length <= absolutePrefix\.length/,
  );
  assert.match(
    qrAllowlist,
    /url\.protocol !== "https:" \|\| url\.username \|\| url\.password \|\| url\.port \|\|\s*url\.search \|\| url\.hash/,
  );
  assert.match(
    qrAllowlist,
    /return url\.origin === SHARED_SUPABASE_ORIGIN &&\s*url\.pathname\.startsWith\(PUBLIC_PAYMENT_ASSET_PREFIX\) &&\s*url\.pathname\.length > PUBLIC_PAYMENT_ASSET_PREFIX\.length/,
  );
  assert.match(
    managementAdapter,
    /assertSafePaymentQrUrls\(payload\);/,
  );

  assert.match(
    manage,
    /draft\.emailEnabled && !draft\.replyToEmail\.trim\(\)[\s\S]*?Reply-To email is required when booking emails are enabled\./,
  );
  assert.match(
    manage,
    /draft\.replyToEmail\.trim\(\) &&[\s\S]*?\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$[\s\S]*?draft\.replyToEmail\.includes\("\.\."\)[\s\S]*?Reply-To must be a valid email address\./,
  );
  assert.match(
    manage,
    /<span>Reply-To email<\/span><input type="email" required=\{businessDraft\.emailEnabled\}/,
  );
});

test("keeps live Add Court and shared hours simple, safe, and responsive", async () => {
  const [manage, manageCss] = await Promise.all([
    readFile(files.manage, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  const courtDraftStart = manage.indexOf("type CourtDraft = {");
  const newCourtDraftStart = manage.indexOf("type NewCourtDraft = {", courtDraftStart);
  const emptyNewCourtStart = manage.indexOf("const emptyNewCourt", newCourtDraftStart);
  assert.ok(
    courtDraftStart >= 0 &&
      newCourtDraftStart > courtDraftStart &&
      emptyNewCourtStart > newCourtDraftStart,
  );
  const courtDraftSource = manage.slice(courtDraftStart, newCourtDraftStart);
  const newCourtDraftSource = manage.slice(newCourtDraftStart, emptyNewCourtStart);
  assert.doesNotMatch(courtDraftSource, /\b(?:slug|sortOrder)\s*:/);
  assert.doesNotMatch(
    newCourtDraftSource,
    /\b(?:slug|sortOrder|minimumHours|maximumHours|minimumLeadMinutes|maximumAdvanceDays)\s*:/,
  );
  assert.match(
    newCourtDraftSource,
    /name:\s*string;[\s\S]*?description:\s*string;[\s\S]*?status:\s*CourtDraft\["status"\];[\s\S]*?opensAt:\s*string;[\s\S]*?peakStartsAt:\s*string;[\s\S]*?closesAt:\s*string;[\s\S]*?dayRate:\s*string;[\s\S]*?peakRate:\s*string;/,
  );

  const hourOptionsStart = manage.indexOf("const wholeHourOptions =");
  const hourOptionsEnd = manage.indexOf(
    "function newCourtDraftFor(",
    hourOptionsStart,
  );
  assert.ok(hourOptionsStart >= 0 && hourOptionsEnd > hourOptionsStart);
  const hourOptionsSource = manage.slice(hourOptionsStart, hourOptionsEnd);
  assert.match(hourOptionsSource, /Array\.from\(\{ length: 24 \}, \(_, hour\) =>/);
  assert.match(
    hourOptionsSource,
    /const value = `\$\{String\(hour\)\.padStart\(2, "0"\)\}:00`/,
  );
  assert.match(
    hourOptionsSource,
    /label: `\$\{displayHour\} \$\{hour < 12 \? "AM" : "PM"\}`/,
  );

  const slugStart = manage.indexOf("function generatedCourtSlug(");
  const sortStart = manage.indexOf("function nextCourtSortOrder(", slugStart);
  const hourLabelStart = manage.indexOf("function wholeHourLabel(", sortStart);
  assert.ok(slugStart >= 0 && sortStart > slugStart && hourLabelStart > sortStart);
  const slugSource = manage.slice(slugStart, sortStart);
  const sortSource = manage.slice(sortStart, hourLabelStart);
  assert.match(slugSource, /new Set\(snapshot\.courts\.map\(\(court\) => court\.slug\)\)/);
  assert.match(slugSource, /if \(!used\.has\(base\)\) return base/);
  assert.match(
    slugSource,
    /const candidate = `\$\{stem\}\$\{suffixText\}`;[\s\S]*?if \(!used\.has\(candidate\)\) return candidate/,
  );
  assert.match(sortSource, /Math\.max\(current, court\.sortOrder\)/);
  assert.match(sortSource, /if \(highest < 10_000\) return highest \+ 1/);
  assert.match(sortSource, /if \(!used\.has\(sortOrder\)\) return sortOrder/);

  const editorStart = manage.indexOf("{snapshot.courts.map((court, index) => {");
  const editorEnd = manage.indexOf("{!snapshot.courts.length", editorStart);
  assert.ok(editorStart >= 0 && editorEnd > editorStart);
  const editorSource = manage.slice(editorStart, editorEnd);
  assert.match(editorSource, /<span>Display name<\/span><input\b/);
  assert.match(editorSource, /<span>Description<\/span><input\b/);
  assert.match(editorSource, /<span>Status<\/span><select\b/);
  assert.doesNotMatch(editorSource, /<span>(?:Slug|Sort order)<\/span>/);
  assert.doesNotMatch(editorSource, /\b(?:slug|sortOrder):\s*draft\./);
  assert.match(
    editorSource,
    /actionType: "court:update",[\s\S]*?payload:\s*\{\s*name: draft\.name,\s*description: draft\.description \|\| null,\s*status: draft\.status,\s*\}/,
  );
  assert.match(
    editorSource,
    /internal address, order, schedule, pricing, and booking rules remain untouched/,
  );

  const dialogRef = manage.indexOf("ref={newCourtDialogRef}", editorEnd);
  const dialogStart = manage.lastIndexOf("<dialog", dialogRef);
  const dialogEnd = manage.indexOf("</dialog>", dialogRef);
  assert.ok(dialogStart >= 0 && dialogRef > dialogStart && dialogEnd > dialogRef);
  const dialogSource = manage.slice(dialogStart, dialogEnd + "</dialog>".length);
  assert.match(
    manage,
    /const openNewCourtDialog = \(\) => \{[\s\S]*?dialog\.showModal\(\)[\s\S]*?querySelector<HTMLInputElement>\("\[data-new-court-name\]"\)\?\.focus\(\)/,
  );
  assert.match(manage, /newCourtDialogRef\.current\?\.close\(\)/);
  assert.match(
    dialogSource,
    /<dialog[\s\S]*?aria-labelledby="add-court-title"[\s\S]*?aria-describedby="add-court-description"[\s\S]*?onCancel=/,
  );
  assert.match(dialogSource, /<h2 id="add-court-title">Add court<\/h2>/);
  assert.match(dialogSource, /<p id="add-court-description">/);
  assert.match(
    dialogSource,
    /<button type="button" className=\{styles\.dialogClose\} aria-label="Close Add court"/,
  );

  const controlsStart = dialogSource.indexOf(
    '<div className={styles.courtDialogBody}>',
  );
  const controlsEnd = dialogSource.indexOf(
    '<footer className={styles.courtDialogActions}>',
    controlsStart,
  );
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  const controlsSource = dialogSource.slice(controlsStart, controlsEnd);
  const controlledFields = [
    ...controlsSource.matchAll(/setNewCourtField\("([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(controlledFields, [
    "name",
    "description",
    "status",
    "opensAt",
    "peakStartsAt",
    "closesAt",
    "dayRate",
    "peakRate",
  ]);
  assert.match(controlsSource, /<span>Court name<\/span><input\b[^>]*\brequired\b/);
  assert.match(
    controlsSource,
    /<span>Description <small>Optional<\/small><\/span><textarea\b(?![^>]*\brequired\b)/,
  );
  assert.match(controlsSource, /<span>Status<\/span><select\b[^>]*\brequired\b/);
  assert.match(
    controlsSource,
    /<span>Opens<\/span><select\b[^>]*value=\{newCourt\.opensAt\}[\s\S]*?key=\{`open-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    controlsSource,
    /<span>Peak starts<\/span><select\b[^>]*value=\{newCourt\.peakStartsAt\}[\s\S]*?key=\{`peak-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    controlsSource,
    /<span>Closes<\/span><select\b[^>]*value=\{newCourt\.closesAt\}[\s\S]*?key=\{`close-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}/,
  );
  assert.match(controlsSource, /<span>Regular rate \/ hour<\/span>/);
  assert.match(controlsSource, /<span>Peak rate \/ hour<\/span>/);
  assert.doesNotMatch(controlsSource, /type="time"/);
  assert.doesNotMatch(
    controlsSource,
    /<span>(?:Slug|Sort order|Minimum hours|Maximum hours|Minimum lead minutes|Maximum advance days)<\/span>/,
  );
  assert.doesNotMatch(
    controlsSource,
    /type="file"|accept="image\/|>\s*(?:Photo|Upload)/i,
  );

  const createStart = dialogSource.indexOf("const generatedSlug =");
  const createEnd = dialogSource.indexOf("onSuccess:", createStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const createSource = dialogSource.slice(createStart, createEnd);
  assert.match(createSource, /generatedCourtSlug\(newCourt\.name, snapshot\)/);
  assert.match(createSource, /nextCourtSortOrder\(snapshot\)/);
  assert.match(createSource, /slug:\s*generatedSlug/);
  assert.match(createSource, /sortOrder:\s*generatedSortOrder/);
  assert.match(createSource, /minimumHours:\s*1/);
  assert.match(createSource, /maximumHours:\s*18/);
  assert.match(createSource, /minimumLeadMinutes:\s*60/);
  assert.match(createSource, /maximumAdvanceDays:\s*30/);

  const scheduleStart = manage.indexOf('{section === "schedule" &&');
  const businessStart = manage.indexOf('{section === "business" &&', scheduleStart);
  assert.ok(scheduleStart >= 0 && businessStart > scheduleStart);
  const scheduleSource = manage.slice(scheduleStart, businessStart);
  assert.equal((scheduleSource.match(/wholeHourOptions\.map/g) ?? []).length, 3);
  assert.match(
    scheduleSource,
    /<span>Opens<\/span><select\b[^>]*value=\{scheduleDraft\.opensAt\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    scheduleSource,
    /<span>Rate boundary<\/span><select\b[^>]*value=\{scheduleDraft\.bands\[0\]!\.end\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    scheduleSource,
    /<span>Closes<\/span><select\b[^>]*value=\{scheduleDraft\.closesAt\}[\s\S]*?>\{option\.label\}/,
  );
  assert.doesNotMatch(scheduleSource, /type="time"/);

  assert.match(cssBlock(manageCss, ".button"), /min-height:\s*44px/);
  assert.match(
    cssBlock(manageCss, ".field input, .field select, .field textarea"),
    /min-height:\s*44px/,
  );
  const closeButtonCss = cssBlock(manageCss, ".dialogClose");
  assert.match(closeButtonCss, /width:\s*44px/);
  assert.match(closeButtonCss, /height:\s*44px/);
  const dialogCss = cssBlock(manageCss, ".courtDialog");
  assert.match(dialogCss, /width:\s*min\(620px,\s*calc\(100vw - 28px\)\)/);
  assert.match(dialogCss, /max-height:\s*calc\(100dvh - 28px\)/);
  assert.match(dialogCss, /overflow:\s*hidden/);
  assert.match(cssBlock(manageCss, ".courtDialogBody"), /overflow-y:\s*auto/);
  const narrowCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    narrowCss,
    /\.courtDialog\s*\{[^}]*width:\s*calc\(100vw - 12px\)[^}]*max-height:\s*calc\(100dvh - 12px\)/s,
  );
  assert.match(
    narrowCss,
    /\.courtBasicsGrid\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
  assert.match(
    narrowCss,
    /\.courtDialogActions \.button\s*\{[^}]*flex:\s*1/s,
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
    /return validBrowserPlatformConfiguration\(\) \? "live" : "preview"/,
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
  assert.match(managementAdapter, /if \(!session\) throw new Error\("MANAGER_SIGN_IN_REQUIRED"\)/);
  assert.match(managementAdapter, /assertDinktopiaContext\(context\)/);
  assert.match(
    managementAdapter,
    /if \([\s\S]*?context\.tenantSlug !== activeTenant\.identity\.slug[\s\S]*?activeTenant\.identity\.slug !== "dinktopia"[\s\S]*?throw new Error\("LIVE_TENANT_SCOPE_MISMATCH"\)/,
  );
  assert.match(
    managementAdapter,
    /tenantSlug !== activeTenant\.identity\.slug \|\| status !== "active"[\s\S]*?throw new Error\("LIVE_MANAGER_SESSION_INVALID"\)/,
  );
  assert.match(
    managementAdapter,
    /if \(!authority\.isSystemOwner\) throw new Error\("PLATFORM_OWNER_REQUIRED"\)/,
  );
  assert.match(managementAdapter, /throw new Error\("LIVE_ACTION_UNSUPPORTED"\)/);
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
  assert.match(booking, /Reserve the slot before sending payment\./);
  assert.match(booking, /Preview hold only/);
  assert.match(booking, /Do not send money\./);
  assert.match(booking, /do not pay/i);
  assert.match(booking, /Cancel unpaid hold/);
  assert.match(booking, /Choose a new time/);

  const adapterHoldEnd = booking.indexOf("async submitPayment(", holdStart);
  const adapterHoldSource = booking.slice(holdStart, adapterHoldEnd);
  assert.match(
    booking,
    /export type BookingHoldRequest = \{[\s\S]*?policyAccepted: boolean;/,
  );
  assert.match(
    adapterHoldSource,
    /if \(!request\.policyAccepted\)\s*\{[\s\S]*?before we hold your slot/,
  );
  assert.match(adapterHoldSource, /policyAccepted: request\.policyAccepted/);
  assert.doesNotMatch(adapterHoldSource, /policyAccepted: true/);

  const reserveStart = booking.indexOf("async function reservePaymentHold(");
  const reserveEnd = booking.indexOf("async function submitPayment(", reserveStart);
  assert.ok(reserveStart >= 0 && reserveEnd > reserveStart);
  const reserveSource = booking.slice(reserveStart, reserveEnd);
  const createHoldIndex = reserveSource.indexOf("adapter.createHold(");
  assert.ok(createHoldIndex >= 0, "expected Step 2 to create the hold before payment");

  for (const [label, guard] of [
    ["customer details", /if \(!validateDetails\(\)\) return;/],
    ["policy acceptance", /if \(!acceptedPolicy\)/],
    ["bootstrap failure", /if \(bootstrapState === "error"\)/],
    ["public-booking readiness", /if \(isLive && !bootstrap\?\.readiness\.publicBookingEnabled\)/],
    ["payment readiness", /if \(isLive && !paymentMethod\)/],
    ["published policy", /if \(isLive && !policyVersion\)/],
    ["Turnstile security", /if \(isLive && \(!securitySiteKey \|\| !turnstileTokenValue\)\)/],
    ["non-empty selection", /if \(!selectedSlots\.length\)/],
    ["canonical live selection", /if \(isLive && !canonicalSelection\)/],
  ]) {
    const match = reserveSource.match(guard);
    assert.ok(match?.index !== undefined, `expected ${label} revalidation`);
    assert.ok(
      match.index < createHoldIndex,
      `expected ${label} to be revalidated before creating the hold`,
    );
  }

  assert.match(
    reserveSource,
    /const booking = await adapter\.createHold\(\{[\s\S]*?items: selectedSlots,[\s\S]*?customer,[\s\S]*?policyAccepted: acceptedPolicy,[\s\S]*?policyVersion:[\s\S]*?turnstileToken:/,
  );
  assert.ok(
    reserveSource.indexOf("setPendingBooking(booking)") > createHoldIndex &&
      reserveSource.indexOf("setStep(3)") >
        reserveSource.indexOf("setPendingBooking(booking)"),
    "expected a successful hold to become the pending booking before opening payment",
  );
  assert.doesNotMatch(reserveSource, /setStep\(4\)/);

  const customerPaymentStart = booking.indexOf(
    "async function submitPayment(",
    reserveEnd,
  );
  const customerPaymentEnd = booking.indexOf(
    "async function cancelCurrentHold(",
    customerPaymentStart,
  );
  assert.ok(customerPaymentStart >= 0 && customerPaymentEnd > customerPaymentStart);
  const customerPaymentSource = booking.slice(
    customerPaymentStart,
    customerPaymentEnd,
  );
  assert.match(
    customerPaymentSource,
    /if \(!pendingBooking\)\s*\{[\s\S]*?Reserve the slot before sending payment\.[\s\S]*?return;/,
  );

  const restoreStart = booking.indexOf("const restoreActiveHold = async () =>");
  const restoreEnd = booking.indexOf("void restoreActiveHold()", restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
  const restoreSource = booking.slice(restoreStart, restoreEnd);
  assert.match(
    restoreSource,
    /if \(restored\.status === "confirmed" \|\| restored\.status === "payment_review"\)[\s\S]*?setPendingBooking\(null\);[\s\S]*?setConfirmedBooking\(restored\);[\s\S]*?setStep\(4\);/,
  );
  assert.match(
    restoreSource,
    /setConfirmedBooking\(null\);[\s\S]*?setPendingBooking\(restored\);[\s\S]*?setStep\(3\);/,
  );

  assert.match(
    booking,
    /if \(!isBookingPage \|\| !isLive \|\| step !== 2 \|\| pendingBooking \|\| !securitySiteKey \|\| !turnstileContainerRef\.current\) return;/,
  );
  assert.match(
    booking,
    /window\.turnstile\.render\(container,[\s\S]*?action: "booking_create"[\s\S]*?callback: \(token\) => setTurnstileTokenValue\(token\)[\s\S]*?"expired-callback": \(\) => setTurnstileTokenValue\(""\)/,
  );
});

test("renders accessible labels, control states, and announcements", async () => {
  const [customerResponse, managerResponse, booking, manage] = await Promise.all([
    render("/book"),
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
  assert.match(customerHtml, /aria-pressed="true"/i);

  assert.match(managerHtml, /aria-label="Management navigation"/i);
  assert.match(managerHtml, /aria-label="Mobile management navigation"/i);
  assert.match(managerHtml, /aria-current="page"/i);
  assert.match(documentText(managerHtml), /Current tenant Dinktopia/i);
  assert.match(managerHtml, /aria-label="Preview search control"/i);
  assert.match(managerHtml, /aria-label="Preview notifications"/i);
  assert.match(managerHtml, /aria-label="Preview account control unavailable"/i);
  assert.match(managerHtml, /role="status"[^>]*aria-live="polite"/i);
  assert.match(
    manage,
    /aria-describedby=\{disabled \? disabledDescriptionId : undefined\}/,
  );
  assert.doesNotMatch(manage, /id="permission-note"/i);

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

test("keeps the three-step checkout and confirmation compact, ordered, and complete on phones", async () => {
  const [booking, publicCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
  ]);

  const stepStarts = [1, 2, 3, 4].map((step) =>
    booking.indexOf(`{step === ${step} &&`),
  );
  assert.ok(
    stepStarts.every((start) => start >= 0) &&
      stepStarts.every((start, index) => index === 0 || start > stepStarts[index - 1]),
    "expected Choose, Details, Payment, and confirmation branches in order",
  );

  const [stepOneStart, stepTwoStart, stepThreeStart, stepFourStart] = stepStarts;
  const stepOne = booking.slice(stepOneStart, stepTwoStart);
  const stepTwo = booking.slice(stepTwoStart, stepThreeStart);
  const stepThree = booking.slice(stepThreeStart, stepFourStart);
  const bookingSummaryStart = booking.indexOf("function BookingSummary(", stepFourStart);
  assert.ok(bookingSummaryStart > stepFourStart);
  const stepFour = booking.slice(stepFourStart, bookingSummaryStart);

  assert.match(booking, /const stepLabels = \["Choose", "Details", "Payment"\]/);
  assert.match(
    booking,
    /<span>Step \{step\} of \{stepLabels\.length\}<\/span>/,
  );
  assert.match(stepOne, /STEP 01[\s\S]*?<h3>When are you playing\?<\/h3>/);
  assert.match(stepTwo, /STEP 02[\s\S]*?<h3>Who&apos;s rallying\?<\/h3>/);
  assert.match(
    stepThree,
    /STEP 03[\s\S]*?<h3 ref=\{paymentHeadingRef\} tabIndex=\{-1\}>[\s\S]*?Pay with \$\{paymentLabel\}[\s\S]*?GCash payment preview/,
  );
  assert.match(stepFour, /className="confirmation-card" role="status"/);
  assert.match(stepFour, /confirmedBooking\.status === "confirmed"/);
  assert.match(
    stepOne,
    /\{selectedSlots\.length > 0 && <p className="date-selection-note">Changing the date clears your selected court-hours\.<\/p>\}/,
  );
  assert.equal((stepOne.match(/className="date-selection-note"/g) ?? []).length, 1);

  assert.match(
    stepTwo,
    /className="booking-layout compact-step booking-details-step"/,
  );
  const stepTwoSummary = stepTwo.indexOf("<BookingSummary");
  const stepTwoForm = stepTwo.indexOf(
    '<form className="booking-main-card booking-details-form"',
  );
  const stepTwoHeading = stepTwo.indexOf("Who&apos;s rallying?");
  assert.ok(
    stepTwoSummary >= 0 &&
      stepTwoForm > stepTwoSummary &&
      stepTwoHeading > stepTwoForm,
    "expected the Step 2 booking summary before the Who's rallying form",
  );

  const summarySource = booking.slice(bookingSummaryStart);
  assert.match(summarySource, /aria-label="Booking summary"/);
  assert.match(
    summarySource,
    /className="summary-mobile-heading"[\s\S]*?Booking details[\s\S]*?\{dateLabel\}[\s\S]*?\{selections\.length\} hr/,
  );
  assert.match(summarySource, /className="summary-sessions" aria-label="Selected sessions"/);
  assert.match(summarySource, /className="price-breakdown"/);
  assert.match(summarySource, /Court booking[\s\S]*Booking fee[\s\S]*summary-total[\s\S]*Total/);
  assert.match(stepTwo, /aria-invalid=\{Boolean\(detailErrors\./);
  assert.match(stepTwo, /className="field-error"/);
  assert.match(stepTwo, /aria-busy=\{isSubmitting\}/);
  assert.match(stepTwo, /className="details-hold-gate"/);
  assert.match(stepTwo, /className="policy-grid"/);
  assert.match(stepTwo, /className=\{`check-row policy-check/);
  assert.match(stepTwo, /id=\{`\$\{formId\}-policy`\}/);
  assert.match(
    stepTwo,
    /\{isLive && \([\s\S]*?className="security-boundary details-security-boundary"[\s\S]*?ref=\{turnstileContainerRef\}/,
  );
  assert.match(
    stepTwo,
    /\{paymentError && \([\s\S]*?className="payment-error" role="alert"[\s\S]*?We couldn&apos;t hold your slot/,
  );
  assert.match(
    stepTwo,
    /data-testid="hold-and-pay"[\s\S]*?type="submit"[\s\S]*?disabled=\{isSubmitting \|\| !acceptedPolicy \|\| !liveSelectionSupported \|\| \(isLive && !turnstileTokenValue\)\}[\s\S]*?Holding your slot[\s\S]*?Hold slot &amp; proceed to payment/,
  );
  assert.match(stepTwo, /No payment is taken when the hold is created\./);

  const policyDisclosures =
    stepTwo.match(/<details className="policy-disclosure">[\s\S]*?<\/details>/g) ?? [];
  assert.equal(policyDisclosures.length, 2);
  for (const disclosure of policyDisclosures) {
    assert.match(disclosure, /<summary>[\s\S]*?<strong>[\s\S]*?<small>View policy<\/small><\/summary>/);
    assert.match(disclosure, /<p>\{(?:policyIntro|policyContent)\}<\/p>/);
  }
  assert.match(policyDisclosures[0], /\{policyTitle\}/);
  assert.match(policyDisclosures[1], /<strong>Rescheduling<\/strong>/);

  assert.match(
    stepFour,
    /\{step === 4 && confirmedBooking && \(/,
  );
  assert.match(
    stepThree,
    /\{step === 3 && checkoutSlot && pendingBooking && \([\s\S]*?className="booking-layout compact-step booking-payment-step"/,
  );
  assert.match(
    stepThree,
    /className="checkout-snapshot" aria-label="Checkout booking summary"[\s\S]*?\{selectedSlots\.length\} court-hour[\s\S]*?\{selectedCourtCount\} court[\s\S]*?\{selectedDateDetails\?\.long\}[\s\S]*?\{peso\(checkoutTotal\)\}/,
  );
  assert.match(stepThree, /className=\{`payment-panel\$\{isLive \? "" : " payment-panel-preview"\}`\}/);
  assert.match(stepThree, /Submit GCash receipt/);
  assert.match(stepThree, /className="payment-error" role="alert"/);
  assert.match(stepThree, /aria-busy=\{isSubmitting\}/);
  assert.equal((stepThree.match(/<BookingSummary\b/g) ?? []).length, 1);
  assert.equal((stepFour.match(/<BookingSummary\b/g) ?? []).length, 0);
  assert.doesNotMatch(stepTwo, /payment-panel|Submit GCash receipt|payment-reference/);
  assert.doesNotMatch(
    booking,
    /booking-review-step|review-to-payment|Review booking|One last look|data-testid="reserve-slot"/,
  );

  const mobileDetailsLayout = cssBlock(publicCss, ".booking-details-step");
  assert.match(mobileDetailsLayout, /grid-template-areas:\s*"summary"\s*"form"/s);
  assert.match(cssBlock(publicCss, ".summary-mobile-heading"), /display:\s*none/);
  assert.match(cssBlock(publicCss, ".checkout-snapshot"), /display:\s*none/);

  const desktopCss = cssBlock(publicCss, "@media (min-width: 980px)");
  assert.match(
    desktopCss,
    /\.booking-details-step\s*\{[^}]*grid-template-areas:\s*"form summary"/s,
  );
  assert.match(
    desktopCss,
    /\.booking-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*302px/s,
  );

  const mobileCss = cssBlock(publicCss, "@media (max-width: 779.98px)");
  assert.match(mobileCss, /\.booking-shell\s*\{[^}]*padding:\s*6px/s);
  assert.match(
    mobileCss,
    /\.booking-main-card\s*\{[^}]*border-radius:\s*16px[^}]*padding:\s*14px/s,
  );
  assert.match(
    mobileCss,
    /\.booking-card-heading\s*\{[^}]*margin-bottom:\s*12px/s,
  );
  assert.match(
    mobileCss,
    /\.compact-step \.booking-summary\s*\{[^}]*display:\s*grid[^}]*padding:\s*14px/s,
  );
  assert.match(
    mobileCss,
    /\.compact-step \.summary-mobile-heading\s*\{[^}]*display:\s*flex/s,
  );
  assert.match(
    mobileCss,
    /\.compact-step \.summary-score,\s*\.compact-step \.summary-heading,\s*\.compact-step \.booking-summary > h3,\s*\.compact-step \.booking-summary > dl\s*\{\s*display:\s*none/s,
  );
  assert.ok(
    mobileCss.lastIndexOf(".compact-step .booking-summary > dl") >
      mobileCss.indexOf(".compact-step .booking-summary dl"),
    "expected the compact summary's redundant detail list to stay hidden after its shared layout rule",
  );
  assert.match(
    mobileCss,
    /\.compact-step \.summary-sessions\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s,
  );
  assert.match(
    mobileCss,
    /\.compact-step \.price-breakdown\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,/s,
  );
  assert.match(
    mobileCss,
    /\.form-field input,\s*\.form-field select\s*\{[^}]*min-height:\s*48px/s,
  );
  assert.match(mobileCss, /\.check-row\s*\{[^}]*min-height:\s*44px/s);
  assert.match(
    mobileCss,
    /\.step-actions \.button\s*\{[^}]*min-height:\s*48px/s,
  );
  assert.match(
    mobileCss,
    /\.booking-payment-step > \.booking-summary\s*\{\s*display:\s*none/s,
  );
  assert.match(mobileCss, /\.checkout-snapshot\s*\{\s*display:\s*flex/s);
  assert.match(
    mobileCss,
    /\.schedule-selection-count\s*\{\s*display:\s*none/s,
  );
  assert.match(
    mobileCss,
    /\.policy-disclosure summary\s*\{[^}]*min-height:\s*44px/s,
  );
  assert.doesNotMatch(
    mobileCss,
    /\.(?:summary-sessions|price-breakdown|summary-total|policy-grid|policy-disclosure|field-error)[^{]*\{[^}]*display:\s*none/s,
  );
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
  assert.match(publicCss, /\.mode-switch a\s*\{[^}]*min-height:\s*44px/s);
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
    /\.ticker-track\s*\{[^}]*display:\s*flex[^}]*width:\s*max-content[^}]*animation:\s*dinktopia-ticker-loop 18s linear infinite[^}]*will-change:\s*transform/s,
  );
  assert.match(
    publicCss,
    /\.ticker-group\s*\{[^}]*width:\s*max-content[^}]*min-width:\s*100vw[^}]*flex:\s*0 0 auto[^}]*gap:\s*var\(--ticker-gap\)[^}]*padding:\s*7px calc\(var\(--ticker-gap\) \/ 2\)/s,
  );
  assert.match(
    publicCss,
    /@keyframes\s+dinktopia-ticker-loop\s*\{\s*to\s*\{\s*transform:\s*translate3d\(-50%,\s*0,\s*0\)/s,
  );
  assert.doesNotMatch(
    booking,
    /tickerRef|tickerInView|IntersectionObserver|ticker-sequence|dinktopia-ticker-hop/,
  );
  assert.match(
    booking,
    /const tickerPhrases = \["PLAY MORE", "RALLY OFTEN", "STAY FOCUSED", "NEW HABIT"\] as const/,
  );
  assert.match(
    booking,
    /className="ticker-motion-toggle sr-only"[\s\S]*?type="checkbox"[\s\S]*?aria-label="Pause or resume moving club phrases"/s,
  );
  assert.match(
    booking,
    /\{\[0, 1\]\.map\(\(copy\) => \([\s\S]*?ticker-group-clone[\s\S]*?tickerPhrases\.map/s,
  );
  assert.doesNotMatch(booking, /<button[^>]*(?:ticker|Pause|Resume)/i);
  assert.doesNotMatch(
    publicCss,
    /\.ticker-viewport:hover[^{]*\{[^}]*animation-play-state/s,
  );
  assert.match(
    publicCss,
    /\.ticker-motion-toggle:checked \+ \.ticker-viewport \.ticker-track,[\s\S]*?animation-play-state:\s*paused/s,
  );
  assert.match(
    publicCss,
    /\.ticker-motion-toggle:focus-visible \+ \.ticker-viewport\s*\{[^}]*outline:\s*3px solid var\(--ink\)/s,
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
    /\.booking-mobile-action\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/s,
  );
  assert.match(
    publicCss,
    /\.booking-selection-card\.has-mobile-selection\s*\{[^}]*padding-bottom:\s*(?:9[6-9]|[1-9][0-9]{2,})px/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.booking-selection-card\.has-mobile-selection\s*\{[^}]*padding-bottom:\s*(?:9[6-9]|[1-9][0-9]{2,})px[^}]*\}/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.booking-mobile-action\s*\{[^}]*display:\s*none[^}]*\}[\s\S]*?\.booking-selection-card\.has-mobile-selection\s*\{[^}]*padding-bottom:\s*24px[^}]*\}/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.header-inner\s*\{[^}]*min-height:\s*64px[^}]*\}[\s\S]*?\.header-inner\s*>\s*\.wordmark\s*\{[^}]*width:\s*164px[^}]*\}[\s\S]*?\.hero-grid\s*\{[^}]*padding-top:\s*120px[^}]*\}[\s\S]*?\.ticker-track\s*\{\s*animation-duration:\s*20s/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*560px\)[\s\S]*?\.hero-grid\s*\{[^}]*padding-top:\s*116px/s,
  );
  assert.match(
    publicCss,
    /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.ticker-track\s*\{\s*animation-duration:\s*24s[^}]*\}[\s\S]*?\.menu-button\s*\{\s*display:\s*none[\s\S]*?\.primary-nav\s*>\s*a,\s*\.primary-nav\s*>\s*button\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*font-size:\s*var\(--text-nav\)[^}]*line-height:\s*1\.3/s,
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
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ticker-motion-toggle\s*\{[^}]*display:\s*none\s*!important[^}]*\}[\s\S]*?\.ticker-track\s*\{[^}]*animation:\s*none\s*!important[^}]*transform:\s*none\s*!important[^}]*\}[\s\S]*?\.ticker-group-clone\s*\{\s*display:\s*none/s,
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

  assert.match(
    booking,
    /className="schedule-cell-mark" aria-hidden="true"/,
  );
  const publicTextCss = publicCss.replace(
    /\.schedule-cell\.is-selected \.schedule-cell-mark\s*\{[^}]*\}/gs,
    "",
  );
  const publicPixelTypeSizes = [
    ...publicTextCss.matchAll(/font-size:\s*([0-9.]+)px/g),
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
