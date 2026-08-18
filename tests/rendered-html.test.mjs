import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  booking: new URL("../app/booking-experience.tsx", import.meta.url),
  bookLoading: new URL("../app/book/loading.tsx", import.meta.url),
  bookPage: new URL("../app/book/page.tsx", import.meta.url),
  client: new URL("../app/lib/platform/client.ts", import.meta.url),
  config: new URL("../app/tenants/kl-pickleball-court/config.ts", import.meta.url),
  dinktopiaConfig: new URL("../app/tenants/dinktopia/config.ts", import.meta.url),
  courtsPage: new URL("../app/courts/page.tsx", import.meta.url),
  courtsLoading: new URL("../app/courts/loading.tsx", import.meta.url),
  globalsCss: new URL("../app/globals.css", import.meta.url),
  initialBrandLoader: new URL("../app/initial-brand-loader.tsx", import.meta.url),
  layout: new URL("../app/layout.tsx", import.meta.url),
  loading: new URL("../app/loading.tsx", import.meta.url),
  manage: new URL("../app/manage/page.tsx", import.meta.url),
  manageLoading: new URL("../app/manage/loading.tsx", import.meta.url),
  calendarView: new URL("../app/manage/calendar-view.tsx", import.meta.url),
  calendarCss: new URL(
    "../app/manage/calendar-view.module.css",
    import.meta.url,
  ),
  analyticsFinance: new URL(
    "../app/manage/analytics-finance.tsx",
    import.meta.url,
  ),
  analyticsFinanceCss: new URL(
    "../app/manage/analytics-finance.module.css",
    import.meta.url,
  ),
  atomicBookingMigration: new URL(
    "../operations/2026-08-11-atomic-multi-session-booking.sql",
    import.meta.url,
  ),
  managementAdapter: new URL(
    "../app/manage/management-adapter.ts",
    import.meta.url,
  ),
  manageCss: new URL("../app/manage/manage.module.css", import.meta.url),
  operatingHours: new URL("../app/lib/operating-hours.ts", import.meta.url),
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

async function loadAtomicBookingClientHarness() {
  const [clientSource, typescriptModule] = await Promise.all([
    readFile(files.client, "utf8"),
    import("typescript"),
  ]);
  const typescript = typescriptModule.default ?? typescriptModule;
  const normalizerStart = clientSource.indexOf(
    "export class PlatformRequestError",
  );
  const normalizerEnd = clientSource.indexOf(
    "function previewBookingSession(",
    normalizerStart,
  );
  const createStart = clientSource.indexOf(
    "export async function createBooking(",
    normalizerEnd,
  );
  const createEnd = clientSource.indexOf(
    "export async function bookingStatus(",
    createStart,
  );
  assert.ok(
    normalizerStart >= 0 && normalizerEnd > normalizerStart &&
      createStart > normalizerEnd && createEnd > createStart,
    "expected the atomic booking client boundaries",
  );

  const harnessSource = `
${clientSource.slice(normalizerStart, normalizerEnd)}
const activeTenant = {
  identity: { slug: "kl-pickleball-court", currency: "PHP" },
};
let capturedBookingRequest = null;
let capturedBookingRequestCount = 0;
function platformMode() { return "live"; }
function previewBookingSession() {
  throw new Error("The live transport harness must not enter preview mode.");
}
function edgeUrl(functionName) {
  return \`https://platform.example.test/functions/v1/\${functionName}\`;
}
function publicHeaders() { return { "Content-Type": "application/json" }; }
async function responseJson(response) { return response.json(); }
async function fetch(url, init) {
  capturedBookingRequestCount += 1;
  capturedBookingRequest = { url, init };
  return new Response(JSON.stringify({
    ok: true,
    booking: { reference: "PB-ATOMIC-TEST" },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
${clientSource.slice(createStart, createEnd)}
export function capturedRequest() {
  return { count: capturedBookingRequestCount, request: capturedBookingRequest };
}
`;
  const transpiled = typescript.transpileModule(harnessSource, {
    compilerOptions: {
      module: typescript.ModuleKind.ES2022,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
}

async function loadBookingSelectionHarness() {
  const [bookingSource, typescriptModule] = await Promise.all([
    readFile(files.booking, "utf8"),
    import("typescript"),
  ]);
  const typescript = typescriptModule.default ?? typescriptModule;
  const selectionStart = bookingSource.indexOf("function selectionKey(");
  const selectionEnd = bookingSource.indexOf("function getPrice(", selectionStart);
  assert.ok(
    selectionStart >= 0 && selectionEnd > selectionStart,
    "expected the booking selection helper boundaries",
  );
  const harnessSource = `
function nextIsoDate(date) {
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
${bookingSource.slice(selectionStart, selectionEnd)}
export { selectionReducer, bookingSessionsFromSelections, groupSelectionDetails };
`;
  const transpiled = typescript.transpileModule(harnessSource, {
    compilerOptions: {
      module: typescript.ModuleKind.ES2022,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
}

test("models overnight court hours as one clearly labelled operating day", async () => {
  const operatingHoursUrl = new URL(files.operatingHours);
  operatingHoursUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const {
    boundaryOptionsFor,
    buildTwoBandSchedule,
    closeOptionsFor,
    formatClockLabel,
    logicalBandForHour,
    logicalBandsForOperatingWindow,
    logicalBoundaryHour,
    logicalCloseHour,
    nextIsoDate,
    normalizeTwoBandSchedule,
  } = await import(operatingHoursUrl.href);

  assert.equal(logicalCloseHour("06:00", "02:00"), 26);
  assert.equal(logicalCloseHour("01:00", "02:00"), 2);
  assert.equal(logicalCloseHour("06:00", "06:00"), null);
  assert.equal(logicalBoundaryHour("06:00", "02:00", "01:00"), 25);
  assert.equal(logicalBoundaryHour("06:00", "02:00", "02:00"), null);

  const closeOptions = closeOptionsFor("06:00");
  assert.equal(closeOptions.length, 23);
  assert.deepEqual(
    closeOptions.filter((option) => ["00:00", "01:00", "02:00"].includes(option.value)),
    [
      { value: "00:00", label: "12 AM (next day)", logicalHour: 24, dayOffset: 1 },
      { value: "01:00", label: "1 AM (next day)", logicalHour: 25, dayOffset: 1 },
      { value: "02:00", label: "2 AM (next day)", logicalHour: 26, dayOffset: 1 },
    ],
  );
  assert.equal(
    boundaryOptionsFor("06:00", "02:00").at(-1)?.label,
    "1 AM (next day)",
  );
  assert.equal(formatClockLabel(25), "1 AM (next day)");

  const schedule = buildTwoBandSchedule({
    opensAt: "06:00",
    closesAt: "02:00",
    boundaryAt: "16:00",
    firstHourlyRate: 300,
    secondHourlyRate: 400,
  });
  assert.deepEqual(schedule, {
    opensAt: "06:00",
    closesAt: "02:00",
    bands: [
      { start: "06:00", end: "16:00", hourlyRate: 300 },
      { start: "16:00", end: "02:00", hourlyRate: 400 },
    ],
  });
  assert.equal(logicalBandForHour(schedule, 25)?.hourlyRate, 400);

  const oneBandSchedule = {
    opensAt: "06:00",
    closesAt: "02:00",
    bands: [{ start: "06:00", end: "02:00", hourlyRate: 250 }],
  };
  assert.deepEqual(logicalBandsForOperatingWindow(oneBandSchedule), [
    {
      start: "06:00",
      end: "02:00",
      hourlyRate: 250,
      logicalStart: 6,
      logicalEnd: 26,
    },
  ]);
  assert.equal(logicalBandForHour(oneBandSchedule, 6)?.hourlyRate, 250);
  assert.equal(logicalBandForHour(oneBandSchedule, 25)?.hourlyRate, 250);

  const unorderedTwoBandSchedule = {
    opensAt: "06:00",
    closesAt: "22:00",
    bands: [
      { start: "16:00", end: "22:00", hourlyRate: 400 },
      { start: "06:00", end: "16:00", hourlyRate: 300 },
    ],
  };
  assert.deepEqual(
    logicalBandsForOperatingWindow(unorderedTwoBandSchedule)?.map((band) =>
      band.hourlyRate
    ),
    [300, 400],
  );
  assert.equal(logicalBandForHour(unorderedTwoBandSchedule, 7)?.hourlyRate, 300);
  assert.equal(logicalBandForHour(unorderedTwoBandSchedule, 17)?.hourlyRate, 400);

  const wrappedTwoBandSchedule = {
    opensAt: "18:00",
    closesAt: "02:00",
    bands: [
      { start: "18:00", end: "23:00", hourlyRate: 350 },
      { start: "23:00", end: "02:00", hourlyRate: 450 },
    ],
  };
  assert.equal(logicalBandForHour(wrappedTwoBandSchedule, 22)?.hourlyRate, 350);
  assert.equal(logicalBandForHour(wrappedTwoBandSchedule, 25)?.hourlyRate, 450);

  const gappedSchedule = {
    opensAt: "06:00",
    closesAt: "02:00",
    bands: [
      { start: "06:00", end: "15:00", hourlyRate: 300 },
      { start: "16:00", end: "02:00", hourlyRate: 400 },
    ],
  };
  assert.equal(logicalBandsForOperatingWindow(gappedSchedule), null);
  assert.equal(logicalBandForHour(gappedSchedule, 14), null);
  assert.deepEqual(
    normalizeTwoBandSchedule({
      opensAt: "06:00",
      closesAt: "00:00",
      bands: [
        { start: "06:00", end: "16:00", hourlyRate: 300 },
        { start: "16:00", end: "24:00", hourlyRate: 400 },
      ],
    }),
    {
      opensAt: "06:00",
      closesAt: "00:00",
      bands: [
        { start: "06:00", end: "16:00", hourlyRate: 300 },
        { start: "16:00", end: "00:00", hourlyRate: 400 },
      ],
    },
  );
  assert.equal(nextIsoDate("2026-08-31"), "2026-09-01");
  assert.equal(nextIsoDate("2026-12-31"), "2027-01-01");
});

test("normalizes atomic booking sessions without collapsing distinct court-hours", async () => {
  const { normalizeBookingSessions, PlatformRequestError } =
    await loadAtomicBookingClientHarness();

  assert.deepEqual(
    normalizeBookingSessions([
      {
        courtId: "court-b",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
    ]),
    [
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
      {
        courtId: "court-b",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
    ],
    "the same hour on two courts must remain two billable sessions",
  );

  assert.deepEqual(
    normalizeBookingSessions([
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "11:00",
        durationHours: 1,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
    ]),
    [
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "11:00",
        durationHours: 1,
      },
    ],
    "a gap must not be turned into a continuous reservation",
  );

  assert.deepEqual(
    normalizeBookingSessions([
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 2,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "10:00",
        durationHours: 2,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
    ]),
    [{
      courtId: "court-a",
      bookingDate: "2026-08-10",
      startTime: "09:00",
      durationHours: 3,
    }],
    "overlapping and duplicate atoms should merge exactly once",
  );

  assert.deepEqual(
    normalizeBookingSessions([
      {
        courtId: "court-a",
        bookingDate: "2026-08-11",
        startTime: "00:00",
        durationHours: 1,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "23:00",
        durationHours: 1,
      },
    ]),
    [{
      courtId: "court-a",
      bookingDate: "2026-08-10",
      startTime: "23:00",
      durationHours: 2,
    }],
    "adjacent court-hours should merge across midnight",
  );

  assert.deepEqual(
    normalizeBookingSessions([{
      courtId: "court-a",
      bookingDate: "2026-08-10",
      startTime: "06:00",
      durationHours: 18,
    }]),
    [{
      courtId: "court-a",
      bookingDate: "2026-08-10",
      startTime: "06:00",
      durationHours: 18,
    }],
  );
  assert.throws(
    () => normalizeBookingSessions([
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "06:00",
        durationHours: 18,
      },
      {
        courtId: "court-b",
        bookingDate: "2026-08-10",
        startTime: "06:00",
        durationHours: 1,
      },
    ]),
    (error) =>
      error instanceof PlatformRequestError && error.status === 400 &&
      error.code === "BOOKING_SESSION_HOURS_EXCEEDED",
  );
});

test("selects and groups 1 PM to 5 PM on two courts without changing the matrix model", async () => {
  const {
    selectionReducer,
    bookingSessionsFromSelections,
    groupSelectionDetails,
  } = await loadBookingSelectionHarness();
  const initialState = { items: [], announcement: "" };
  const selections = ["court-1", "court-2"].flatMap((courtId) =>
    [13, 14, 15, 16].map((startHour) => ({
      courtId,
      startHour,
      durationHours: 1,
      amount: courtId === "court-1" ? 300 : 350,
    }))
  );
  const state = selections.reduce(
    (current, item) => selectionReducer(current, {
      type: "toggle",
      item,
      courtName: item.courtId === "court-1" ? "Court 1" : "Court 2",
      startsAt: `${item.startHour}:00`,
      endsAt: `${item.startHour + 1}:00`,
      restrictToSingleRun: false,
      maximumTotalHours: 18,
    }),
    initialState,
  );

  assert.equal(state.items.length, 8);
  assert.match(state.announcement, /8 court-hours across 2 courts selected\./);
  assert.deepEqual(
    bookingSessionsFromSelections("2026-08-10", state.items),
    [
      {
        courtId: "court-1",
        bookingDate: "2026-08-10",
        startTime: "13:00",
        durationHours: 4,
      },
      {
        courtId: "court-2",
        bookingDate: "2026-08-10",
        startTime: "13:00",
        durationHours: 4,
      },
    ],
  );

  const courts = {
    "court-1": { id: "court-1", number: "01", name: "Court 1" },
    "court-2": { id: "court-2", number: "02", name: "Court 2" },
  };
  const details = state.items.map((selection) => ({
    selection,
    court: courts[selection.courtId],
    slot: {
      hour: selection.startHour,
      price: selection.amount,
      startsAt: `${selection.startHour}:00`,
      endsAt: `${selection.startHour + 1}:00`,
      status: "available",
    },
  }));
  assert.deepEqual(
    groupSelectionDetails(details).map((group) => ({
      court: group.court.name,
      startHour: group.startHour,
      endHour: group.endHour,
      courtHours: group.courtHours,
      subtotal: group.subtotal,
    })),
    [
      { court: "Court 1", startHour: 13, endHour: 17, courtHours: 4, subtotal: 1200 },
      { court: "Court 2", startHour: 13, endHour: 17, courtHours: 4, subtotal: 1400 },
    ],
  );

  const afterDeselect = selectionReducer(state, {
    type: "toggle",
    item: selections.find((item) => item.courtId === "court-1" && item.startHour === 14),
    courtName: "Court 1",
    startsAt: "14:00",
    endsAt: "15:00",
    restrictToSingleRun: false,
    maximumTotalHours: 18,
  });
  assert.equal(afterDeselect.items.length, 7);
  assert.ok(!afterDeselect.items.some(
    (item) => item.courtId === "court-1" && item.startHour === 14,
  ));
  assert.match(afterDeselect.announcement, /removed\. 7 court-hours across 2 courts selected\./);
});

test("atomic matrix selection enforces an 18 court-hour total cap", async () => {
  const { selectionReducer } = await loadBookingSelectionHarness();
  const fullState = {
    items: Array.from({ length: 18 }, (_, startHour) => ({
      courtId: "court-1",
      startHour,
      durationHours: 1,
      amount: 300,
    })),
    announcement: "",
  };
  const cappedState = selectionReducer(fullState, {
    type: "toggle",
    item: { courtId: "court-2", startHour: 13, durationHours: 1, amount: 350 },
    courtName: "Court 2",
    startsAt: "13:00",
    endsAt: "14:00",
    restrictToSingleRun: false,
    maximumTotalHours: 18,
  });
  assert.equal(cappedState.items.length, 18);
  assert.match(cappedState.announcement, /up to 18 total court-hours/);
});

test("sends one canonical atomic-session payload without legacy scalar fields", async () => {
  const { createBooking, capturedRequest } = await loadAtomicBookingClientHarness();
  const customer = {
    name: "Atomic Player",
    email: "atomic@example.test",
    phone: "09170000000",
  };
  await createBooking({
    sessions: [
      {
        courtId: "court-b",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
      {
        courtId: "court-a",
        bookingDate: "2026-08-10",
        startTime: "09:00",
        durationHours: 1,
      },
    ],
    courtId: "legacy-primary-must-not-leak",
    bookingDate: "2026-01-01",
    startTime: "01:00",
    durationHours: 9,
    customer,
    guestCount: 2,
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    policyAccepted: true,
    policyVersion: "policy-v1",
  });

  const captured = capturedRequest();
  assert.equal(captured.count, 1);
  assert.equal(
    captured.request.url,
    "https://platform.example.test/functions/v1/create-booking",
  );
  assert.equal(captured.request.init.method, "POST");
  const payload = JSON.parse(captured.request.init.body);
  assert.deepEqual(payload.sessions, [
    {
      courtId: "court-a",
      bookingDate: "2026-08-10",
      startTime: "09:00",
      durationHours: 1,
    },
    {
      courtId: "court-b",
      bookingDate: "2026-08-10",
      startTime: "09:00",
      durationHours: 1,
    },
  ]);
  assert.equal(payload.tenantSlug, "kl-pickleball-court");
  assert.deepEqual(payload.customer, customer);
  assert.equal(payload.clientRequestId, "11111111-1111-4111-8111-111111111111");
  assert.equal("turnstileToken" in payload, false);
  for (const legacyField of [
    "courtId",
    "bookingDate",
    "startTime",
    "durationHours",
  ]) {
    assert.equal(legacyField in payload, false);
  }
  for (const protectedField of [
    "subtotalAmount",
    "serviceFeeAmount",
    "totalAmount",
    "currency",
    "slots",
  ]) {
    assert.equal(protectedField in payload, false);
  }
});

test("keeps multi-court holds atomic under one secure booking lifecycle", async () => {
  const migration = await readFile(files.atomicBookingMigration, "utf8");

  assert.match(
    migration,
    /unique \(tenant_id, booking_id, court_id, starts_at\)/,
    "two courts may share a start time under one grouped reservation",
  );
  assert.match(
    migration,
    /create or replace function public\.create_public_booking_group_with_access[\s\S]*?security definer[\s\S]*?set row_security = 'off'/,
  );
  assert.match(
    migration,
    /when v_session_index = 1 then p_access_token_hash[\s\S]*?md5\(p_access_token_hash \|\| ':' \|\| v_session_index::text\)/,
    "temporary child holds require non-colliding token digests",
  );
  assert.match(
    migration,
    /update public\.booking_slots[\s\S]*?set booking_id = v_primary_id[\s\S]*?delete from public\.bookings/,
    "validated sessions must consolidate inside the same transaction",
  );
  assert.match(
    migration,
    /'policyAcceptance', p_sessions #> '\{0,metadata,policyAcceptance\}'/,
    "the consolidated booking must retain the server-validated policy evidence",
  );
  assert.match(
    migration,
    /revoke all on function public\.create_public_booking_group_with_access[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/,
  );
});

test("carries overnight court-hours through availability, pricing, and checkout", async () => {
  const [booking, publicCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
  ]);

  const availabilityStart = booking.indexOf("async getAvailability(request)");
  const holdStart = booking.indexOf("async createHold(request)", availabilityStart);
  assert.ok(availabilityStart >= 0 && holdStart > availabilityStart);
  const availabilitySource = booking.slice(availabilityStart, holdStart);
  assert.match(availabilitySource, /logicalCloseHour\(court\.opensAt, court\.closesAt\)/);
  assert.match(availabilitySource, /closeHour !== null && closeHour > 24/);
  assert.match(availabilitySource, /getPlatformAvailability\(followingDate\)/);
  assert.match(
    availabilitySource,
    /length:\s*Math\.max\(0, closingHour - openingHour\)/,
  );
  assert.match(availabilitySource, /const slotDate = hour >= 24 \? followingDate : request\.date/);
  assert.match(availabilitySource, /timestampPeriodOverlaps\(/);
  assert.match(availabilitySource, /String\(hour % 24\)\.padStart\(2, "0"\)/);
  assert.match(booking, /logicalBandForHour\(/);

  const paymentStart = booking.indexOf("async submitPayment(", holdStart);
  assert.ok(paymentStart > holdStart);
  const holdSource = booking.slice(holdStart, paymentStart);
  assert.match(
    holdSource,
    /const serializedDate = canonical\.startHour >= 24\s*\? nextIsoDate\(request\.date\)\s*:\s*request\.date/,
  );
  assert.match(
    holdSource,
    /const serializedStartHour = \(\(canonical\.startHour % 24\) \+ 24\) % 24/,
  );
  assert.match(holdSource, /bookingDate:\s*serializedDate/);
  assert.match(
    holdSource,
    /startTime:\s*`\$\{String\(serializedStartHour\)\.padStart\(2, "0"\)\}:00`/,
  );

  assert.match(booking, /\(record\.startHour \?\? 48\) < 48/);
  assert.match(booking, /item\.startHour < 48/);
  assert.match(booking, /className=\{`availability-time\$\{hour === 24 \? " schedule-next-day-divider" : ""\}`\}/);
  assert.match(booking, /\{hour === 24 \? "NEXT DAY · " : "to "\}/);
  assert.match(booking, /aria-label=\{hour === 24 && selectedFollowingDate \? `Next day, \$\{longDateLabel\(selectedFollowingDate\)\}` : undefined\}/);
  assert.match(
    booking,
    /aria-label=\{`\$\{court\.name\}, \$\{formatHourWithDay\(hour\)\} to \$\{formatHourWithDay\(hour \+ 1\)\}/,
  );

  const nextDayRule = cssBlock(publicCss, ".schedule-next-day-marker");
  assert.match(nextDayRule, /display:\s*flex/);
  assert.match(nextDayRule, /min-height:\s*30px/);
  assert.match(
    cssBlock(publicCss, ".schedule-next-day-marker span"),
    /font-size:\s*var\(--text-caption\)/,
  );
  const mobileCss = cssBlock(publicCss, "@media (max-width: 779.98px)");
  assert.doesNotMatch(
    mobileCss,
    /\.schedule-scroll\s*\{[^}]*max-height:\s*(?!none)|\.schedule-scroll\s*\{[^}]*overflow:\s*auto/s,
  );
});

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

  assert.equal(documentTitle(home), "Pickleball Court Booking · K&L Pickleball Court");
  assert.equal(documentTitle(courts), "Our Courts · K&L Pickleball Court");
  assert.equal(documentTitle(selectedBook), "Reserve a Court · K&L Pickleball Court");
  assert.equal(documentTitle(manageBook), "Manage Booking · K&L Pickleball Court");

  for (const html of [home, courts, selectedBook, invalidBook, repeatedBook]) {
    assert.match(html, /<html\b[^>]*\blang="en-PH"/i);
    assert.match(html, /<meta\b[^>]*\bname="robots"[^>]*\bcontent="index, follow"/i);
    assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i);
    assert.equal(countTags(html, "main"), 1);
    assert.equal(countTags(html, "h1"), 1);
    assert.equal(countTags(html, "header"), 1);
    assert.equal(countTags(html, "footer"), 1);
    assert.match(html, /<main\b[^>]*id="main-content"/i);
    assert.doesNotMatch(html, starterMarkers);
    assert.doesNotMatch(documentText(html), /Dinktopia/i);
  }
  assert.match(manageBook, /<meta\b[^>]*\bname="robots"[^>]*\bcontent="noindex, nofollow"/i);

  const homeText = documentText(home);
  assert.match(home, /class="hero-visual"[^>]*aria-hidden="true"/i);
  assert.match(homeText, /K&L Pickleball Court · Connecting/i);
  assert.match(homeText, /Your court\. Your crew\. Your next rally\./i);
  assert.match(homeText, /Rates soon per court-hour/i);
  assert.match(homeText, /Checking booking access/i);
  assert.match(
    await readFile(files.booking, "utf8"),
    /function getMinimumConfiguredHourlyRate\(courts: PublicCourt\[\]\)[\s\S]*?Math\.min\(\.\.\.rates\)/,
  );
  assert.match(
    home,
    /<a\b(?=[^>]*class="button button-lime button-large")(?=[^>]*href="\/book")[^>]*>\s*Reserve a court\b/is,
  );
  assert.match(home, /<a\b(?=[^>]*class="text-link")(?=[^>]*href="#how-it-works")/is);
  assert.doesNotMatch(home, /class="court-discovery section-pad"|class="booking-zone section-pad"/i);

  assert.match(homeText, /Local courts\. Good rallies\. Your crew\. K&L Pickleball\./i);
  assert.match(home, /class="ticker-motion-toggle sr-only"[^>]*type="checkbox"/i);
  assert.match(home, /class="ticker-track"[^>]*aria-hidden="true"/i);
  assert.equal((home.match(/class="home-marquee-sequence ticker-group(?: ticker-group-clone)?"/g) ?? []).length, 2);
  assert.match(home, /LOCAL COURTS[\s\S]*GOOD RALLIES[\s\S]*YOUR CREW[\s\S]*K&amp;L PICKLEBALL/i);
  assert.doesNotMatch(home, /<button\b[^>]*(?:ticker|Pause|Resume)/i);

  const tickerStart = home.indexOf('class="home-benefits"');
  const galleryStart = home.indexOf('class="club-gallery section-pad"');
  const communityStart = home.indexOf('class="club-note"');
  const howStart = home.indexOf('class="how-section section-pad"');
  assert.ok(tickerStart >= 0 && galleryStart > tickerStart && communityStart > galleryStart && howStart > communityStart);
  const galleryHtml = home.slice(galleryStart, howStart);
  assert.match(galleryHtml, /id="gallery"/i);
  assert.match(galleryHtml, /Court gallery/i);
  assert.match(galleryHtml, /Court photos pending/i);
  assert.match(galleryHtml, /class="gallery-grid gallery-grid-placeholder"|<figure\b/i);
  assert.doesNotMatch(galleryHtml, /<img\b/i);
  assert.match(home, /<a\b[^>]*href="#gallery"[^>]*>Gallery<\/a>/i);

  assert.match(courts, /class="court-discovery section-pad"/i);
  assert.match(courts, /Choose your court\.[\s\S]*Find the time that fits\./i);
  assert.match(documentText(courts), /Loading configured courts|No published courts/i);
  assert.match(documentText(courts), /Court details will appear after management setup is complete|Loading the court directory/i);
  assert.doesNotMatch(courts, /href="\/book\?court=preview-court-/i);
  assert.doesNotMatch(courts, /class="hero"|class="booking-zone section-pad"|class="club-gallery/i);

  assert.match(selectedBook, /class="booking-zone section-pad"/i);
  assert.match(selectedBook, /Reserve your court/i);
  assert.doesNotMatch(selectedBook, /class="hero"|class="court-discovery section-pad"|class="club-gallery/i);

  assert.match(manageBook, /Manage your booking/i);
  assert.match(manageBook, /Find booking/i);
  assert.doesNotMatch(manageBook, /class="court-discovery section-pad"|class="club-gallery/i);
});

test("uses atomic multi-court checkout with responsive desktop and mobile matrices", async () => {
  const [bookResponse, booking, publicCss, config] = await Promise.all([
    render("/book"),
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
    readFile(files.config, "utf8"),
  ]);
  assertHtmlResponse(bookResponse);
  const bookHtml = await bookResponse.text();

  assert.match(documentText(bookHtml), /Checking availability/i);
  assert.match(documentText(bookHtml), /Booking details are coming soon|Loading the court board/i);
  assert.doesNotMatch(bookHtml, /<legend\b[^>]*>Choose court-hours<\/legend>/i);
  assert.doesNotMatch(bookHtml, /<legend>How long\?<\/legend>|class="duration-control"/i);

  assert.match(config, /previewCourts:\s*\[\]/);

  assert.match(
    booking,
    /const configuredPreviewCourts = activeTenant\.previewCourts[\s\S]*?const previewCourts:\s*Court\[\]\s*=\s*configuredPreviewCourts\.map\(\(court, index\) => \(\{/,
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
    /className=\{`date-option \$\{selectedDate === date\.iso \? "is-selected selected" : ""\}`\}[\s\S]*?role="radio"[\s\S]*?aria-checked=\{selectedDate === date\.iso\}[\s\S]*?aria-label=\{date\.long\}/s,
  );
  assert.match(
    booking,
    /<p className="sr-live" aria-live="polite" aria-atomic="true">\{selectionState\.announcement\}<\/p>/,
  );

  const selectionCountClass = booking.indexOf('className="schedule-selection-count"');
  const selectionCountStart = booking.lastIndexOf("<div", selectionCountClass);
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
  assert.match(selectionCountSource, /role="status"/);
  assert.match(selectionCountSource, /aria-live="polite"/);
  assert.doesNotMatch(selectionCountSource, /<button/);
  assert.match(
    booking,
    /<button[\s\S]*?className=\{`slot-clear-button\$\{selectedSlots\.length \? "" : " is-placeholder"\}`\}[\s\S]*?disabled=\{!selectedSlots\.length\}[\s\S]*?aria-hidden=\{!selectedSlots\.length\}[\s\S]*?tabIndex=\{selectedSlots\.length \? 0 : -1\}[\s\S]*?onClick=\{clearSelection\}[\s\S]*?>[\s\S]*?Clear[\s\S]*?<\/button>/s,
  );
  assert.doesNotMatch(selectionCountSource, /selectedSlots\.length > 0 &&/);
  assert.doesNotMatch(
    booking,
    /schedule-scroll-hint|Scroll sideways to see more courts|Swipe sideways/i,
  );

  assert.doesNotMatch(
    booking,
    /mobile-availability-picker|mobile-court-rail|mobile-time-grid|desktop-schedule-picker/,
  );
  assert.match(booking, /className="availability-scroll"/);
  assert.match(booking, /className="availability-grid"/);
  assert.match(booking, /className="availability-mobile"/);
  assert.match(booking, /className="mobile-availability-grid"/);
  assert.doesNotMatch(booking, /\$\{availableCount\} court-hours open/);
  assert.match(publicCss, /\.booking-route \.availability-mobile\s*\{\s*display:\s*none/s);
  assert.match(
    publicCss,
    /@media \(max-width: 760px\)[\s\S]*?\.booking-route \.availability-scroll\s*\{\s*display:\s*none[^}]*\}[\s\S]*?\.booking-route \.availability-mobile\s*\{[^}]*display:\s*block/s,
  );
  const matrixStart = booking.indexOf('<div className="rally-availability-board">');
  const matrixEnd = booking.indexOf("{isLive && selectedSlots.length", matrixStart);
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart, "expected the RallyOS responsive availability board");
  const matrixSource = booking.slice(matrixStart, matrixEnd);
  assert.ok(
    (matrixSource.match(/displayCourts\.map\(\(court\) =>/g) ?? []).length >= 3,
    "expected published courts in the desktop and mobile RallyOS grids",
  );
  assert.ok(
    (matrixSource.match(/scheduleHours\.map\(\(hour\) =>/g) ?? []).length >= 3,
    "expected both grids to derive from the hourly schedule",
  );
  assert.match(
    matrixSource,
    /courtSchedule\?\.slots\.find\(\(item\) => item\.hour === hour\)/,
  );
  assert.match(matrixSource, /const isSelected = selectedKeys\.has\(selectionKey\(court\.id, hour\)\)/);
  assert.match(matrixSource, /const busy = !slot \|\| slot\.status === "unavailable"/);
  assert.match(matrixSource, /const ownedState = ownedSlotStates\.get\(selectionKey\(court\.id, hour\)\)/);
  assert.match(matrixSource, /const displayedState = ownedState \?\? slot\?\.publicState/);
  assert.match(matrixSource, /displayedState === "held"[\s\S]*?"Held"/);
  assert.match(matrixSource, /displayedState === "payment_review"[\s\S]*?"Reviewing"/);
  assert.match(matrixSource, /displayedState === "confirmed"[\s\S]*?"Booked"/);
  assert.match(matrixSource, /busy[\s\S]*?"Booked"/);
  assert.match(
    matrixSource,
    /aria-label=\{`All courts hourly availability for \$\{selectedBaseDateLabel\}\. Scroll horizontally to see later times\.`\}/,
  );
  assert.match(matrixSource, /aria-pressed=\{isSelected\}/);
  assert.match(matrixSource, /disabled=\{busy \|\| Boolean\(displayedState\)\}/);
  assert.match(
    matrixSource,
    /onClick=\{\(\) => slot && !busy && !displayedState && chooseSlot\(court, slot\)\}/,
  );
  assert.match(matrixSource, /availability-cell\$\{displayedState \? ` owned-state owned-\$\{displayedState\}` : busy \? " busy" : isSelected \? " selected" : ""\}/);
  assert.doesNotMatch(matrixSource, /isLimitBlocked|is-limit-blocked|selection limit/i);
  assert.doesNotMatch(matrixSource, /aria-disabled=/);

  const ownedStateStart = booking.indexOf("const ownedSlotStates = useMemo(");
  const ownedStateEnd = booking.indexOf("const liveBookingReady", ownedStateStart);
  assert.ok(ownedStateStart >= 0 && ownedStateEnd > ownedStateStart, "expected private owned-slot overlay state");
  const ownedStateSource = booking.slice(ownedStateStart, ownedStateEnd);
  assert.match(ownedStateSource, /const booking = pendingBooking \?\? confirmedBooking/);
  assert.match(ownedStateSource, /if \(!booking\)[\s\S]*?crossTabOwnershipHint\?\.date === selectedDate/);
  assert.match(ownedStateSource, /crossTabOwnershipHint\.slots\.forEach/);
  assert.match(ownedStateSource, /booking\.date !== selectedDate \|\| booking\.status === "cancelled"/);
  assert.match(ownedStateSource, /booking\.status === "pending_payment" && !holdExpired/);
  assert.match(ownedStateSource, /booking\.items\?\.length/);
  assert.match(ownedStateSource, /states\.set\(selectionKey\(item\.courtId, item\.startHour\), state\)/);

  assert.match(booking, /const slotOwnershipHintStorageKey = `\$\{tenantStoragePrefix\}:slot-ownership-hint:v1`/);
  assert.match(booking, /const ownershipHintMaximumLifetimeMs = 24 \* 60 \* 60 \* 1000/);
  const hintParserStart = booking.indexOf("function parseSlotOwnershipHint(");
  const hintParserEnd = booking.indexOf("function tenantPlaceholderEmail(", hintParserStart);
  assert.ok(hintParserStart >= 0 && hintParserEnd > hintParserStart, "expected strict cross-tab hint parsing");
  const hintParserSource = booking.slice(hintParserStart, hintParserEnd);
  assert.match(hintParserSource, /candidate\.expiresAt <= now/);
  assert.match(hintParserSource, /candidate\.expiresAt > now \+ ownershipHintMaximumLifetimeMs/);
  assert.match(hintParserSource, /candidate\.slots\.length > 18/);
  assert.match(hintParserSource, /slot\.startHour > 47/);

  const hintSyncStart = booking.indexOf("const syncOwnershipHint = (rawValue?: string | null)");
  const hintSyncEnd = booking.indexOf("if (!crossTabOwnershipHint) return;", hintSyncStart);
  assert.ok(hintSyncStart >= 0 && hintSyncEnd > hintSyncStart, "expected storage-event hint synchronization");
  const hintSyncSource = booking.slice(hintSyncStart, hintSyncEnd);
  assert.match(hintSyncSource, /event\.storageArea === localStorage && event\.key === slotOwnershipHintStorageKey/);
  assert.match(hintSyncSource, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(hintSyncSource, /window\.removeEventListener\("storage", handleStorage\)/);

  const hintWriterStart = booking.indexOf("const now = Date.now();", hintSyncEnd);
  const hintWriterEnd = booking.indexOf("if (step !== 3 || !pendingBooking) return;", hintWriterStart);
  assert.ok(hintWriterStart >= 0 && hintWriterEnd > hintWriterStart, "expected bounded ownership-hint writer");
  const hintWriterSource = booking.slice(hintWriterStart, hintWriterEnd);
  assert.match(hintWriterSource, /localStorage\.setItem\(slotOwnershipHintStorageKey, JSON\.stringify\(hint\)\)/);
  assert.match(hintWriterSource, /date: booking\.date,[\s\S]*?state,[\s\S]*?expiresAt,[\s\S]*?updatedAt: now,[\s\S]*?slots/);
  assert.doesNotMatch(hintWriterSource, /\.reference|\.token|customer|paymentReference|receipt/i);

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
    /action\.maximumTotalHours !== undefined[\s\S]*?items\.length >= action\.maximumTotalHours/,
  );
  assert.match(
    reducerSource,
    /action\.restrictToSingleRun[\s\S]*?action\.singleRunMaximumHours !== undefined[\s\S]*?items\.length >= action\.singleRunMaximumHours/,
  );
  assert.match(
    reducerSource,
    /if \(action\.restrictToSingleRun && items\.length > 0\)/,
  );
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
    /dispatchSelection\(\{[\s\S]*?type: "toggle"[\s\S]*?courtId: court\.id[\s\S]*?startHour: slot\.hour[\s\S]*?durationHours: 1[\s\S]*?restrictToSingleRun: isLive && !atomicMultiSessionBooking,[\s\S]*?maximumTotalHours: isLive && atomicMultiSessionBooking \? 18 : undefined,[\s\S]*?singleRunMaximumHours:[\s\S]*?isLive && !atomicMultiSessionBooking/s,
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

  const summaryStart = booking.indexOf("function RallyBookingSummary(");
  const summaryEnd = booking.indexOf("type ManageBookingProps", summaryStart);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
  const summarySource = booking.slice(summaryStart, summaryEnd);
  assert.match(summarySource, /groupSelectionDetails\(selections\)/);
  assert.match(
    summarySource,
    /className="player-kicker">Your reservation[\s\S]*?courts reserved[\s\S]*?\{dateLabel\}[\s\S]*?\{slotLabel\}/,
  );
  assert.match(summarySource, /className="summary-price-lines"/);
  assert.match(summarySource, /className="rally-summary-total"/);
  assert.doesNotMatch(
    summarySource,
    /COURT-HOURS|summary-score|summary-heading|summary-footnote|<dl>|actionLabel/,
  );

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
    /platformMode\(\) === "live" &&[\s\S]*?!canonicalSelection &&[\s\S]*?!request\.atomicMultiSessionBooking[\s\S]*?throw new Error\(/s,
  );
  assert.match(holdSource, /atomic group hold/);
  assert.match(holdSource, /no partial reservations were created/);
  assert.ok(
    holdSource.indexOf('platformMode() === "live"') <
      holdSource.indexOf("createPlatformBooking("),
    "expected unsupported live groups to fail before any hold request",
  );
  assert.match(
    booking,
    /const atomicMultiSessionBooking =\s*!isLive \|\| bootstrap\?\.capabilities\?\.atomicMultiSessionBookingV1 !== false/,
  );

  const reserveStart = booking.indexOf("async function createSelectionHold(");
  const reserveEnd = booking.indexOf("async function completeHeldBookingDetails(", reserveStart);
  assert.ok(reserveStart >= 0 && reserveEnd > reserveStart);
  const reserveSource = booking.slice(reserveStart, reserveEnd);
  assert.match(
    reserveSource,
    /if \(isLive && !liveSelectionSupported\)\s*\{[\s\S]*?atomicMultiSessionBooking[\s\S]*?no partial reservation will be created\.[\s\S]*?return;/s,
  );
  assert.ok(
    reserveSource.indexOf("isLive && !liveSelectionSupported") <
      reserveSource.indexOf("adapter.createHold("),
    "expected the UI to reject unsupported live groups before calling its adapter",
  );

  assert.match(
    publicCss,
    /\.booking-route \.availability-scroll\s*\{[^}]*overflow:\s*auto[^}]*border-radius:\s*16px[^}]*scrollbar-width:\s*thin/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-grid\s*\{[^}]*min-width:\s*1162px[^}]*grid-template-columns:\s*142px repeat\(var\(--slot-count\), minmax\(68px, 1fr\)\)/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-court\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s,
  );
  assert.doesNotMatch(
    publicCss,
    /\.mobile-availability-picker|\.mobile-court-rail|\.mobile-time-grid|\.desktop-schedule-picker/,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-corner,[\s\S]*?\.booking-route \.availability-cell\s*\{[^}]*min-height:\s*52px/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-cell\s*\{[^}]*background:\s*white[^}]*transition:\s*none/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-cell\.busy\s*\{[^}]*repeating-linear-gradient[^}]*cursor:\s*not-allowed/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.availability-cell\.selected\s*\{[^}]*background:\s*var\(--violet\)[^}]*box-shadow:/s,
  );
  assert.match(
    publicCss,
    /\.booking-route \.mobile-availability-grid\s*\{[^}]*grid-template-columns:\s*80px repeat\(var\(--court-count\), minmax\(58px, 1fr\)\)/s,
  );

  assert.equal(
    (booking.match(/className="slot-step-footer stage-footer booking-selection-footer"/g) ?? []).length,
    1,
    "expected one responsive selection footer",
  );
  assert.match(
    booking,
    /className="slot-step-footer stage-footer booking-selection-footer"[\s\S]*?className=\{`slot-clear-button\$\{selectedSlots\.length \? "" : " is-placeholder"\}`\}[\s\S]*?data-testid="booking-continue"/s,
  );
  const responsiveBookingCss = publicCss.slice(publicCss.indexOf("/* RallyOS-inspired player booking workspace */"));
  assert.match(responsiveBookingCss, /\.slot-step-footer\s*\{[^}]*display:\s*flex/s);
  assert.match(responsiveBookingCss, /@media \(max-width: 779\.98px\)[\s\S]*?\.availability-legend-row\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/s);
  assert.match(responsiveBookingCss, /@media \(max-width: 779\.98px\)[\s\S]*?\.slot-step-footer\s*\{[^}]*position:\s*static/s);
  assert.match(
    responsiveBookingCss,
    /@media \(min-width: 980px\)[\s\S]*?\.booking-slot-step\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );

  for (const [selector, expectedDimensions, minimum] of [
    ["date-option", ["min-width", "min-height"], 44],
    ["mobile-selection-clear", ["min-width", "min-height"], 44],
  ]) {
    const rule = publicCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, "s"));
    assert.ok(rule, `expected ${selector} styles`);
    for (const dimension of expectedDimensions) {
      const size = rule[1].match(new RegExp(`${dimension}:\\s*([0-9.]+)px`));
      assert.ok(
        size && Number(size[1]) >= minimum,
        `expected ${selector} ${dimension} to be at least ${minimum}px`,
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
  assert.match(loadingScreen, /liveDeployment \? "Live booking" : "Setup preview"/);
  assert.match(loadingScreen, /liveDeployment \? "Loading live court availability…" : "Loading the venue preview…"/);
  assert.match(loadingScreen, /liveDeployment \? "Checking courts, rates, and open times\." : "Details are still being configured\."/);
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

test("covers live tenant bootstrap with a premium K&L brand intro", async () => {
  const [intro, layout, booking, globalsCss] = await Promise.all([
    readFile(files.initialBrandLoader, "utf8"),
    readFile(files.layout, "utf8"),
    readFile(files.booking, "utf8"),
    readFile(files.globalsCss, "utf8"),
  ]);

  assert.match(layout, /<InitialBrandLoader \/>/);
  assert.match(intro, /kl-pickleball-court:tenant-ready/);
  assert.match(intro, /addEventListener\(TENANT_READY_EVENT, finish/);
  assert.match(intro, /window\.setTimeout\(finish, 2500\)/);
  assert.doesNotMatch(intro, /sessionStorage/);
  assert.match(booking, /window\.dispatchEvent\(new Event\(TENANT_READY_EVENT\)\)/);
  assert.match(intro, /src="\/kl-pickleball-court-logo\.webp"/);
  assert.match(intro, /role="status"/);
  assert.match(intro, /aria-live="polite"/);
  assert.match(intro, /data-phase=\{phase\}/);
  assert.match(globalsCss, /\.brand-intro\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*20000/s);
  assert.match(globalsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.brand-intro-orbit/s);
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
  assert.match(galleryDataSource, /const localOrigin = `https:\/\/\$\{activeTenant\.identity\.slug\}\.invalid`/);
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
    /url\.origin === "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/,
  );
  assert.match(
    galleryDataSource,
    /url\.pathname\.startsWith\("\/storage\/v1\/object\/public\/tenant-public-assets\/"\)/,
  );
  assert.match(galleryDataSource, /item\.published !== true/);
  assert.match(galleryDataSource, /tenantBootstrap\.tenant\.publicConfig\?\.venueGallery/);
  assert.match(galleryDataSource, /venue-gallery\/\$\{id\}/);
  assert.match(galleryDataSource, /\.sort\(\(left, right\) => Number\(right\.featured\)/);
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
  const galleryMarkupEnd = booking.indexOf("  return (", galleryMarkupStart);
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
    /aria-label=\{`\$\{activeTenant\.identity\.name\} court gallery`\}\s*role="region"\s*tabIndex=\{0\}/s,
  );
  assert.match(galleryMarkup, /<figcaption>\{photo\.caption\}<\/figcaption>/);
  assert.match(galleryMarkup, /className="gallery-grid gallery-grid-placeholder"/);
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

  assert.match(documentTitle(html), /K&amp;L|K&L/i);
  assert.doesNotMatch(documentTitle(html), /Starter|taking shape/i);
  assert.match(html, /<html\b[^>]*\blang="en-PH"/i);
  assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i);
  assert.equal(countTags(html, "main"), 1);
  assert.equal(countTags(html, "aside"), 1);
  assert.equal(countTags(html, "nav"), 2);
  assert.equal(countTags(html, "footer"), 0);
  assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"/i);
  assert.match(text, /K&L Pickleball Court Court operations/i);
  assert.match(text, /Current tenant K&L/i);
  assert.match(text, /Viewing as (?:Setup preview|Court owner)/i);
  assert.match(text, /Loading K&L Pickleball Court management data/i);
  assert.doesNotMatch(html, starterMarkers);
});

test("uses a neutral connected-tenant state until readiness resolves", async () => {
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
  assert.match(customerText, /Connecting to K&L/i);
  assert.match(customerText, /Loading verified venue and booking details\./i);
  assert.doesNotMatch(customerText, /Public reservations and payments remain disabled\./i);
  assert.match(customerHtml, /href="\/courts"/i);
  assert.doesNotMatch(customerHtml, /class="booking-zone section-pad"/i);

  assert.match(managerText, /Setup preview|Live connection/i);
  assert.match(managerText, /No tenant account loaded|Viewing as Court owner/i);
  assert.match(managerText, /Loading K&L Pickleball Court management data/i);
  assert.doesNotMatch(managerHtml, /aria-label="Non-authoritative preview controls"/i);
  assert.doesNotMatch(managerHtml, /class="[^"]*pageFooter/i);
});

test("applies centralized security headers to HTTP and HTTPS responses", async () => {
  const [workerSource, httpResponse, httpsResponse, missingResponse] =
    await Promise.all([
      readFile(files.worker, "utf8"),
      render("/"),
      render("/", "https://preview.kl-pickleball-court.example"),
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

test("uses K&L's approved logo and owner-supplied brand palette without reusing Dinktopia assets", async () => {
  const [booking, config, globalsCss, layout, manage, manageCss, publicCss, homeResponse, manageResponse] =
    await Promise.all([
      readFile(files.booking, "utf8"),
      readFile(files.config, "utf8"),
      readFile(files.globalsCss, "utf8"),
      readFile(files.layout, "utf8"),
      readFile(files.manage, "utf8"),
      readFile(files.manageCss, "utf8"),
      readFile(files.publicCss, "utf8"),
      render("/"),
      render("/manage"),
    ]);
  assertHtmlResponse(homeResponse);
  assertHtmlResponse(manageResponse);
  const [homeHtml, manageHtml] = await Promise.all([
    homeResponse.text(),
    manageResponse.text(),
  ]);

  assert.match(config, /kind:\s*"image"[\s\S]*?src:\s*"\/kllogo\.jpg"[\s\S]*?alt:\s*"K&L Pickleball Courts"[\s\S]*?temporary:\s*false/);
  await access(new URL("../public/kllogo.jpg", import.meta.url));
  assert.match(booking, /tenantLogo\.kind === "image"[\s\S]*?tenantLogo\.label/);
  assert.match(manage, /logo\.kind === "image"[\s\S]*?logo\.label/);
  for (const html of [homeHtml, manageHtml]) {
    assert.match(documentText(html), /K&L(?: Pickleball Court)?/i);
    assert.doesNotMatch(html, /dinktopia-logo\.png/i);
  }
  assert.match(
    publicCss,
    /\.wordmark\s*\{[^}]*width:\s*132px[^}]*background:\s*transparent[^}]*padding:\s*0/s,
  );
  assert.match(publicCss, /\.kl-court-site \.wordmark\s*\{[^}]*width:\s*auto[^}]*gap:\s*11px/s);
  assert.match(publicCss, /\.kl-court-site \.brand-logo\s*\{[^}]*clip-path:\s*circle\(47\.6% at 50% 50%\)/s);
  assert.match(booking, /className="brand-lockup-copy"[\s\S]*?<strong>K&amp;L<\/strong>[\s\S]*?Pickleball Court/s);
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
    manageCss,
    /\.sidebar\s*\{[^}]*background:[^;]*var\(--brand-surface\);[^}]*color:\s*var\(--ink\)/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.mobileBrand\s*\{[^}]*background:\s*var\(--brand-surface\)[^}]*color:\s*var\(--ink\)/s,
  );

  for (const source of [globalsCss, publicCss]) {
    assert.match(source, /#102a43/i);
    assert.match(source, /#254c84/i);
    assert.match(source, /#82f500/i);
    assert.match(source, /#f6f4ee/i);
  }
  assert.match(config, /primary:\s*"#113F7D"/);
  assert.match(config, /paper:\s*"#FFF8E7"/);
  assert.match(config, /electric:\s*"#2B62A6"/);
  assert.match(config, /citrus:\s*"#BFFF68"/);
  assert.match(config, /coral:\s*"#F65355"/);

  assert.match(layout, /activeTenant\.brand\.socialImagePath/);

  const klAccessibilityCss = publicCss.slice(
    publicCss.lastIndexOf("/* K&L public accessibility"),
  );
  assert.match(
    klAccessibilityCss,
    /\.kl-court-site \.site-footer\s*\{[^}]*background:\s*#ebe5d8[^}]*color:\s*var\(--court-green-deep\)/s,
  );
  assert.match(
    klAccessibilityCss,
    /\.kl-court-site \.site-footer \.footer-grid a,[\s\S]*?color:\s*var\(--navy-bright\)/s,
  );
  assert.match(
    klAccessibilityCss,
    /\.kl-court-site \.site-footer \.footer-grid p,[\s\S]*?\.footer-bottom\s*\{\s*color:\s*#4f6179/s,
  );
});

test("pins K&L active scope while preserving Dinktopia's registered config", async () => {
  const [registry, config, dinktopiaConfig] = await Promise.all([
    readFile(files.registry, "utf8"),
    readFile(files.config, "utf8"),
    readFile(files.dinktopiaConfig, "utf8"),
  ]);

  assert.match(
    registry,
    /export const ACTIVE_TENANT_SLUG\s*=\s*"kl-pickleball-court"\s+as const/,
  );
  assert.match(
    registry,
    /tenantRegistry\s*=\s*\{[\s\S]*?dinktopia:\s*dinktopiaConfig,[\s\S]*?"kl-pickleball-court":\s*klPickleballCourtConfig[\s\S]*?\}\s*as const/s,
  );
  assert.match(
    registry,
    /if\s*\(!Object\.prototype\.hasOwnProperty\.call\(tenantRegistry, slug\)\)\s*\{\s*throw new Error\("Unknown tenant\."\)/s,
  );
  assert.match(
    registry,
    /activeTenant[\s\S]*?tenantRegistry\[ACTIVE_TENANT_SLUG\]/,
  );

  assert.match(config, /name:\s*"K&L Pickleball Court"/);
  assert.match(config, /shortName:\s*"K&L"/);
  assert.match(config, /slug:\s*"kl-pickleball-court"/);
  assert.match(config, /locale:\s*"en-PH"/);
  assert.match(config, /currency:\s*"PHP"/);
  assert.match(config, /timezone:\s*"Asia\/Manila"/);
  assert.match(config, /productionDomain:\s*"klpickleball\.pages\.dev"/);
  assert.match(
    config,
    /activation:\s*\{\s*status:\s*"active",\s*publicBookingEnabled:\s*true,\s*provisional:\s*false/s,
  );
  for (const field of [
    "locationLabel", "address", "opensAt", "closesAt", "minimumHours",
    "maximumHours", "minimumLeadMinutes", "maximumAdvanceDays", "slotMinutes",
    "holdMinutes", "offPeakEndsAt", "offPeakHourlyRate", "peakHourlyRate",
    "paymentFlow", "cancellation", "rescheduling",
  ]) assert.match(config, new RegExp(`${field}:\\s*null`));
  assert.match(config, /direction:\s*"Energetic neighborhood court culture/);
  assert.match(config, /tagline:\s*"Your local court\. Your next rally\."/);
  assert.match(config, /socialImagePath:\s*"\/og\.webp"/);
  assert.match(config, /previewCourts:\s*\[\]/);
  assert.match(config, /kind:\s*"image"[\s\S]*?src:\s*"\/kllogo\.jpg"[\s\S]*?temporary:\s*false/);
  assert.doesNotMatch(config, /dinktopia|@|\+63|GCash/i);

  assert.match(dinktopiaConfig, /slug:\s*"dinktopia"/);
  assert.match(dinktopiaConfig, /productionDomain:\s*"dinktopia\.pages\.dev"/);
  assert.equal((dinktopiaConfig.match(/slug:\s*"preview-court-0[1-4]"/g) ?? []).length, 4);
});

test("tenant-scopes recovery, policy, calendar, email, and sharing artifacts", async () => {
  const [booking, client] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.client, "utf8"),
  ]);

  assert.match(booking, /const tenantStoragePrefix = activeTenant\.identity\.slug/);
  for (const artifact of ["booking", "pending", "storage-probe", "active-hold"]) {
    assert.match(booking, new RegExp(`\\$\\{tenantStoragePrefix\\}:${artifact}`));
  }
  assert.match(
    booking,
    /`booking-\$\{clientRequestId\}@pending\.\$\{activeTenant\.identity\.slug\}\.invalid`/,
  );
  assert.match(
    booking,
    /policyVersion:\s*isLive \? policyVersion : `\$\{activeTenant\.identity\.slug\}-provisional-v1`/,
  );
  assert.match(booking, /PRODID:-\/\/\$\{activeTenant\.identity\.name\}\/\/Court Booking\/\/EN/);
  assert.match(booking, /DTSTART;TZID=\$\{activeTenant\.identity\.timezone\}/);
  assert.match(
    booking,
    /link\.download = `\$\{activeTenant\.identity\.slug\}-\$\{confirmedBooking\.reference\.toLowerCase\(\)\}\.ics`/,
  );
  assert.match(
    booking,
    /navigator\.share\(\{ title: `\$\{activeTenant\.identity\.name\} court booking`, text: shareText, url: shareUrl \}\)/,
  );
  assert.match(client, /body:\s*JSON\.stringify\(\{ \.\.\.body, tenantSlug: activeTenant\.identity\.slug \}\)/);
  assert.doesNotMatch(client, /tenantSlug:\s*["']dinktopia["']/i);
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
  assert.match(client, /function registeredManagementOrigin\(\): string \| null/);
  assert.match(client, /activeTenant\.identity\.productionDomain\?\.trim\(\)\.toLowerCase\(\)/);
  assert.match(client, /if \(!domain\) return null/);
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
    /if \(options\.mutation && \(!registeredOrigin \|\| origin !== registeredOrigin\)\)/,
  );
  assert.match(
    client,
    /"get_my_tenant_session"[\s\S]*?p_tenant_slug:\s*activeTenant\.identity\.slug,[\s\S]*?p_hostname:\s*managementHostname\(\)/,
  );

  for (const wrapper of [
    "createManualBooking",
    "rescheduleBooking",
    "cancelTenantBooking",
    "checkInTenantBooking",
    "getManagerCourts",
    "getBlockedDateAccess",
    "getTenantPolicy",
    "saveTenantPolicy",
    "getRemittanceDestination",
    "saveRemittanceDestination",
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
    /const liveCapabilityKey = snapshot\?\.session\.capabilities[\s\S]*?\.slice\(\)[\s\S]*?\.sort\(\)[\s\S]*?\.join\("\|"\)[\s\S]*?capabilities:\s*isPreview\s*\?\s*previewRoleSessions\[role\]\s*:\s*liveCapabilityKey\s*\?\s*liveCapabilityKey\.split\("\|"\) as ManagementCapability\[\][\s\S]*?: \[\]/,
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
    /const capabilities = authorityCapabilities\(serverSession\)/,
  );
  assert.match(
    managementAdapter,
    /const isSystemOwner = serverRole === "owner" && membershipRole === null/,
  );
  assert.match(
    managementAdapter,
    /function authorityCapabilities\(session: VerifiedManagerSession\): ManagementCapability\[\][\s\S]*?if \(session\.isSystemOwner\)[\s\S]*?"booking:create"[\s\S]*?"booking:update"[\s\S]*?"booking:cancel"[\s\S]*?"booking:check-in"[\s\S]*?"schedule:block"[\s\S]*?"customer:view"[\s\S]*?"report:view"[\s\S]*?"settings:update"[\s\S]*?"tenant:publish"/,
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

test("keeps System Owner authority distinct from tool readiness and rechecks every booking write", async () => {
  const [client, manage, managementAdapter, manageCss] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  const authorityStart = managementAdapter.indexOf(
    "function authorityCapabilities(",
  );
  const authorityEnd = managementAdapter.indexOf(
    "function exactInteger(",
    authorityStart,
  );
  assert.ok(authorityStart >= 0 && authorityEnd > authorityStart);
  const authoritySource = managementAdapter.slice(authorityStart, authorityEnd);
  assert.match(
    authoritySource,
    /if \(session\.isSystemOwner\)\s*\{\s*return \[[\s\S]*?"booking:create"[\s\S]*?"booking:update"[\s\S]*?"booking:cancel"[\s\S]*?"booking:check-in"[\s\S]*?"payment:review"[\s\S]*?"payment:asset"[\s\S]*?"schedule:block"[\s\S]*?"customer:view"[\s\S]*?"report:view"[\s\S]*?"settings:update"[\s\S]*?"tenant:publish"[\s\S]*?\];\s*\}/,
  );
  const ownerAuthority = authoritySource.slice(
    authoritySource.indexOf('session.membershipRole === "owner"'),
    authoritySource.indexOf('session.membershipRole === "admin"'),
  );
  const adminAuthority = authoritySource.slice(
    authoritySource.indexOf('session.membershipRole === "admin"'),
    authoritySource.indexOf('session.membershipRole === "staff"'),
  );
  const staffAuthority = authoritySource.slice(
    authoritySource.indexOf('session.membershipRole === "staff"'),
  );
  assert.match(
    ownerAuthority,
    /return \[[\s\S]*?"booking:create"[\s\S]*?"booking:update"[\s\S]*?"booking:cancel"[\s\S]*?"booking:check-in"[\s\S]*?"payment:review"[\s\S]*?"payment:asset"[\s\S]*?"schedule:block"[\s\S]*?"customer:view"[\s\S]*?"report:view"[\s\S]*?"settings:update"[\s\S]*?\];/,
  );
  assert.match(
    adminAuthority,
    /return \[[\s\S]*?"booking:create"[\s\S]*?"booking:update"[\s\S]*?"booking:cancel"[\s\S]*?"booking:check-in"[\s\S]*?"payment:review"[\s\S]*?"schedule:block"[\s\S]*?"customer:view"[\s\S]*?"report:view"[\s\S]*?"settings:update"[\s\S]*?\];/,
  );
  assert.doesNotMatch(adminAuthority, /payment:asset/);
  assert.match(
    staffAuthority,
    /return \["booking:cancel", "booking:check-in", "payment:review", "customer:view"\];[\s\S]*?return \[\];/,
  );
  assert.doesNotMatch(staffAuthority, /payment:asset/);
  const tenantManagerBranch = authoritySource.slice(
    authoritySource.indexOf('session.membershipRole === "owner"'),
    authoritySource.indexOf('session.membershipRole === "staff"'),
  );
  assert.doesNotMatch(tenantManagerBranch, /tenant:publish/);

  assert.match(
    managementAdapter,
    /const capabilities = authorityCapabilities\(serverSession\);/,
  );
  assert.match(
    managementAdapter,
    /session:\s*\{ \.\.\.serverSession, capabilities \}/,
  );
  assert.match(
    managementAdapter,
    /toolAvailability:\s*\{[\s\S]*?"booking:create": true,[\s\S]*?"booking:update": true,[\s\S]*?"booking:cancel": true,[\s\S]*?"booking:check-in": true,[\s\S]*?"settings:update": courtResult !== null &&[\s\S]*?"tenant:publish": activationPermissions\.canActivatePublicBooking/,
  );
  assert.doesNotMatch(
    managementAdapter,
    /authorityCapabilities\([^)]*(?:toolAvailability|activationPermissions|courtResult|blockAccess)/,
  );

  assert.match(manage, /Full platform account authority/);
  assert.match(manage, /styles\.capabilityReady[\s\S]*?"Connected"/);
  assert.match(manage, /styles\.capabilityUnavailable[\s\S]*?"Unavailable"/);
  assert.match(manage, /A temporary read or setup gap does not remove System Owner authority\./);
  assert.match(
    manage,
    /const visibleCapabilities: ManagementCapability\[\] = capabilities\.filter\([\s\S]*?capability !== "booking:check-in"[\s\S]*?\.filter\(\(capability\) => visibleCapabilities\.includes\(capability\)\)[\s\S]*?className=\{styles\.granted\}/,
  );
  assert.match(
    manage,
    /visibleCapabilities\.includes\(capability\)[\s\S]*?\.map\(\(capability\) =>[\s\S]*?toolAvailability\[capability\] === false \? styles\.capabilityUnavailable : styles\.capabilityReady[\s\S]*?toolAvailability\[capability\] === false \? "Unavailable" : "Connected"/,
  );
  assert.doesNotMatch(
    manage,
    /setCapabilities|setSessionRole|toolAvailability\[[^\]]+\][\s\S]{0,100}capabilities\.push/,
  );
  assert.match(
    manage,
    /const liveCapabilityKey = snapshot\?\.session\.capabilities[\s\S]*?\.slice\(\)[\s\S]*?\.sort\(\)[\s\S]*?\.join\("\|"\)[\s\S]*?capabilities:\s*isPreview\s*\?\s*previewRoleSessions\[role\]\s*:\s*liveCapabilityKey\s*\?\s*liveCapabilityKey\.split\("\|"\) as ManagementCapability\[\][\s\S]*?: \[\]/,
  );

  assert.ok(
    (managementAdapter.match(/const session = await currentOwnerSession\(\)/g) ?? [])
      .length >= 2,
    "expected live reads and writes to require the current authenticated account",
  );
  assert.ok(
    (managementAdapter.match(/await getManagerSession\(session\.access_token\)/g) ?? [])
      .length >= 2,
    "expected live reads and writes to derive role facts from the server",
  );
  assert.doesNotMatch(managementAdapter, /\bcontext\.(?:role|capabilities)\b/);

  const bookingActionStart = managementAdapter.indexOf(
    'action.type === "booking:create"',
  );
  const policyActionStart = managementAdapter.indexOf(
    'action.type === "policy:update"',
    bookingActionStart,
  );
  assert.ok(bookingActionStart >= 0 && policyActionStart > bookingActionStart);
  const bookingActionSource = managementAdapter.slice(
    bookingActionStart,
    policyActionStart,
  );
  assert.match(bookingActionSource, /assertBookingManager\(authority, "create"\)/);
  assert.match(bookingActionSource, /assertBookingManager\(authority, "reschedule"\)/);
  assert.match(bookingActionSource, /assertBookingManager\(authority, "cancel"\)/);
  assert.match(bookingActionSource, /assertBookingManager\(authority, "check-in"\)/);
  assert.match(
    managementAdapter,
    /const staffWrite = action === "cancel" \|\| action === "check-in";[\s\S]*?!manager && !\(staffWrite && session\.membershipRole === "staff"\)[\s\S]*?BOOKING_ACTION_ACCESS_DENIED/,
  );

  for (const wrapper of [
    "createManualBooking",
    "rescheduleBooking",
    "cancelTenantBooking",
    "checkInTenantBooking",
  ]) {
    const start = client.indexOf(`export async function ${wrapper}(`);
    const end = client.indexOf("\nexport ", start + 1);
    assert.ok(start >= 0, `expected ${wrapper}`);
    const source = client.slice(start, end >= 0 ? end : undefined);
    assert.match(
      source,
      /managementHostname\(\{ mutation: true \}\)/,
      `expected ${wrapper} to enforce the registered mutation origin`,
    );
  }

  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.compactFields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  const phoneCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    phoneCss,
    /\.compactActionForm\s*\{[^}]*padding:\s*14px/s,
  );
  assert.match(
    phoneCss,
    /\.compactFields,\s*\.launchEditorGrid \.compactFields\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
});

test("connects create, reschedule, and cancel without exposing check-in or confusing booking identifiers", async () => {
  const [client, manage, managementAdapter] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
  ]);

  assert.match(
    managementAdapter,
    /export type Booking = \{\s*bookingId:\s*string;[\s\S]*?reference:\s*string;\s*id:\s*string;/,
  );
  assert.match(
    managementAdapter,
    /export type Booking = \{[\s\S]*?bookingType:\s*"regular" \| "event";/,
  );
  const mapperStart = managementAdapter.indexOf("function mapLiveBooking(");
  const mapperEnd = managementAdapter.indexOf("function mapLiveBlock(", mapperStart);
  assert.ok(mapperStart >= 0 && mapperEnd > mapperStart);
  const mapperSource = managementAdapter.slice(mapperStart, mapperEnd);
  assert.match(mapperSource, /const bookingId = value\(row, \["id"\]\)/);
  assert.match(
    mapperSource,
    /const reference = value\(row, \["reference", "booking_reference"\]\)/,
  );
  assert.match(mapperSource, /!UUID_PATTERN\.test\(bookingId\)/);
  assert.match(
    mapperSource,
    /const bookingType = value\(row, \["booking_type", "bookingType"\]\)\.toLowerCase\(\)[\s\S]*?bookingType !== "regular" && bookingType !== "event"/,
  );
  assert.match(mapperSource, /bookingId,[\s\S]*?reference,[\s\S]*?id:\s*reference,/);
  assert.match(
    mapperSource,
    /status:\s*liveStatus\(row, payment, paymentEvidence\)/,
  );
  const liveStatusStart = managementAdapter.indexOf("function liveStatus(");
  const liveStatusEnd = managementAdapter.indexOf(
    "function initialsFor(",
    liveStatusStart,
  );
  assert.ok(liveStatusStart >= 0 && liveStatusEnd > liveStatusStart);
  assert.match(
    managementAdapter.slice(liveStatusStart, liveStatusEnd),
    /if \(status === "cancelled"\) return "cancelled";[\s\S]*?if \(status === "expired"\) return "expired";[\s\S]*?if \(status === "completed"\) return "completed";[\s\S]*?if \(value\(row, \["checked_in_at"\]\)\) return "checked_in";/,
  );

  const createFormStart = manage.indexOf("function BookingsView(");
  const createFormEnd = manage.indexOf("function ScheduleView(", createFormStart);
  assert.ok(createFormStart >= 0 && createFormEnd > createFormStart);
  const bookingUi = manage.slice(createFormStart, createFormEnd);
  assert.match(bookingUi, /<h3>New paid booking<\/h3>/);
  assert.match(
    bookingUi,
    /actionType:\s*"booking:create",[\s\S]*?courtId:\s*manual\.courtId,[\s\S]*?clientRequestId:\s*crypto\.randomUUID\(\)/,
  );
  assert.match(bookingUi, /confirmLabel:\s*"Create paid booking"/);
  assert.match(
    bookingUi,
    /actionType:\s*"booking:update",\s*resourceId:\s*rescheduling\.bookingId,[\s\S]*?bookingId:\s*rescheduling\.bookingId,[\s\S]*?bookingReference:\s*rescheduling\.reference,[\s\S]*?idempotencyKey:\s*crypto\.randomUUID\(\)/,
  );
  assert.match(bookingUi, /confirmLabel:\s*"Reschedule booking"/);
  assert.match(
    bookingUi,
    /actionType:\s*"booking:cancel",\s*resourceId:\s*booking\.bookingId,\s*payload:\s*\{ reason:/,
  );
  assert.match(bookingUi, /aria-label=\{`Cancel booking \$\{booking\.id\}`\}/);
  assert.doesNotMatch(bookingUi, /booking:check-in|>\s*Check in\s*</i);
  assert.match(
    bookingUi,
    /const canMoveBooking = !isPreview && booking\.status === "confirmed" && booking\.payment === "paid";[\s\S]*?\{canMoveBooking && \([\s\S]*?>\s*Move\s*<\/button>/,
  );
  assert.match(
    bookingUi,
    /const terminal = booking\.status === "completed" \|\|[\s\S]*?booking\.status === "cancelled" \|\| booking\.status === "expired";[\s\S]*?const canCancelBooking = !terminal && booking\.status !== "checked_in";/,
  );

  const accessStart = manage.indexOf("function AccessView(");
  const accessEnd = manage.indexOf("function SignInGate(", accessStart);
  assert.ok(accessStart >= 0 && accessEnd > accessStart);
  const accessUi = manage.slice(accessStart, accessEnd);
  assert.match(
    accessUi,
    /const visibleCapabilities:[\s\S]*?capabilities\.filter\([\s\S]*?capability !== "booking:check-in"/,
  );
  assert.match(
    accessUi,
    /Object\.keys\(CAPABILITY_LABEL\)[\s\S]*?\.filter\(\(capability\) => visibleCapabilities\.includes\(capability\)\)[\s\S]*?\.map\(\(capability\)/,
  );

  assert.match(
    client,
    /"create-manual-booking",\s*accessToken,\s*input/,
  );
  assert.match(
    client,
    /"reschedule-booking",\s*accessToken,\s*\{ action:\s*"reschedule", \.\.\.input \}/,
  );
  assert.match(client, /"cancel_tenant_booking"[\s\S]*?p_booking_id:\s*bookingId/);
  assert.match(
    client,
    /export type BookingReschedulePreview = \{[\s\S]*?booking:\s*\{[\s\S]*?id:\s*string;[\s\S]*?reference:\s*string;[\s\S]*?status:\s*string;[\s\S]*?paymentStatus:\s*string;[\s\S]*?options:\s*Array<\{[\s\S]*?additionalAmount:\s*number;[\s\S]*?paymentRequired:\s*boolean;[\s\S]*?amountPolicy:\s*"preserve_original"/,
  );
  assert.match(
    client,
    /previewBookingReschedule\([\s\S]*?authenticatedFunction<BookingReschedulePreview>\([\s\S]*?"reschedule-booking"[\s\S]*?\{ action:\s*"preview", bookingReference, bookingDate \}/,
  );

  assert.match(
    managementAdapter,
    /function assertNoSensitiveIdentifiers\([\s\S]*?normalized === "tenantid"[\s\S]*?normalized === "ptenantid"[\s\S]*?normalized\.includes\("servicerole"\)[\s\S]*?LIVE_PAYLOAD_FIELD_FORBIDDEN/,
  );
  assert.match(
    managementAdapter,
    /function manualBookingPayload\([\s\S]*?assertAllowedKeys\(payload, new Set\(\[[\s\S]*?"courtId", "bookingDate", "startTime", "durationHours", "customer", "payment", "clientRequestId"[\s\S]*?requiredUuidV4\(payload\.clientRequestId, "MANUAL_BOOKING_REQUEST_ID_INVALID"\)/,
  );
  assert.match(
    managementAdapter,
    /function rescheduleBookingPayload\([\s\S]*?const bookingId = requiredUuid\(payload\.bookingId,[\s\S]*?bookingId !== requiredUuid\(resourceId,[\s\S]*?BOOKING_IDENTIFIER_MISMATCH[\s\S]*?const bookingReference = safeActionText\(payload\.bookingReference,[\s\S]*?requiredUuidV4\(payload\.idempotencyKey, "RESCHEDULE_IDEMPOTENCY_KEY_INVALID"\)/,
  );
  assert.match(
    managementAdapter,
    /publicReason:\s*safeActionText\(payload\.publicReason, 3, 500, "RESCHEDULE_REASON_INVALID"\)/,
  );
  assert.match(
    managementAdapter,
    /safeActionText\(payload\.internalNote, 3, 1_000, "RESCHEDULE_NOTE_INVALID"\)/,
  );
  assert.match(
    bookingUi,
    /Customer-facing reason<\/span><input required minLength=\{3\} maxLength=\{500\}/,
  );
  assert.match(
    bookingUi,
    /Internal note <small>optional<\/small><\/span><input minLength=\{3\} maxLength=\{1000\}/,
  );

  const previewValidatorStart = managementAdapter.indexOf(
    "function invalidReschedulePreview(",
  );
  const previewValidatorEnd = managementAdapter.indexOf(
    "function safeActionText(",
    previewValidatorStart,
  );
  assert.ok(
    previewValidatorStart >= 0 && previewValidatorEnd > previewValidatorStart,
  );
  const previewValidator = managementAdapter.slice(
    previewValidatorStart,
    previewValidatorEnd,
  );
  assert.match(
    previewValidator,
    /new PlatformRequestError\(\s*502,\s*"RESCHEDULE_PREVIEW_INVALID"/,
  );
  assert.match(
    previewValidator,
    /value\(booking, \["id"\]\)\.toLowerCase\(\) !== expected\.bookingId[\s\S]*?value\(booking, \["reference"\]\)\.toUpperCase\(\) !== expected\.bookingReference/,
  );
  assert.match(
    previewValidator,
    /value\(booking, \["status"\]\) !== "confirmed"[\s\S]*?value\(booking, \["paymentStatus"\]\) !== "paid"[\s\S]*?policies\.amountPolicy !== "preserve_original"/,
  );
  assert.match(
    previewValidator,
    /reasonCodes\.length !== RESCHEDULE_REASONS\.size[\s\S]*?policies\.notificationDefault !== true[\s\S]*?!Array\.isArray\(envelope\.options\)/,
  );
  assert.match(
    previewValidator,
    /option\.paymentRequired !== \(amounts\.additionalAmount > 0\)[\s\S]*?invalidReschedulePreview\(\)/,
  );

  const performPreviewStart = managementAdapter.indexOf(
    'if (action.type === "booking:update")',
  );
  const performPreviewEnd = managementAdapter.indexOf(
    'if (action.type === "booking:cancel")',
    performPreviewStart,
  );
  assert.ok(performPreviewStart >= 0 && performPreviewEnd > performPreviewStart);
  const performPreview = managementAdapter.slice(
    performPreviewStart,
    performPreviewEnd,
  );
  assert.match(
    performPreview,
    /await previewBookingReschedule\([\s\S]*?validatedReschedulePreviewOption\(preview, \{[\s\S]*?bookingId:\s*requiredUuid\(action\.resourceId,[\s\S]*?bookingReference:\s*payload\.bookingReference,[\s\S]*?startTime:\s*payload\.newStartTime/,
  );
  assert.match(
    performPreview,
    /if \(!selectedOption\.available\)[\s\S]*?"RESCHEDULE_TIME_UNAVAILABLE"/,
  );
  assert.match(
    performPreview,
    /selectedOption\.paymentRequired \|\| selectedOption\.additionalAmount > 0[\s\S]*?"RESCHEDULE_ADDITIONAL_PAYMENT_REQUIRED"[\s\S]*?await rescheduleBooking/,
  );
  assert.match(
    managementAdapter,
    /function cancelBookingPayload\([\s\S]*?assertAllowedKeys\(payload, new Set\(\["reason"\]\)[\s\S]*?CANCEL_BOOKING_REASON_INVALID/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "booking:check-in"[\s\S]*?assertNoPayload\(action\.payload\)[\s\S]*?requiredUuid\(action\.resourceId, "BOOKING_ID_INVALID"\)/,
  );
  assert.doesNotMatch(
    managementAdapter,
    /(?:createManualBooking|rescheduleBooking|cancelTenantBooking|checkInTenantBooking)\([^)]*\b(?:context\.tenantSlug|tenantId|tenant_id)\b/,
  );
});

test("keeps booking Rules editable with CAS and makes Launch an authoritative owner workflow", async () => {
  const [client, manage, managementAdapter, manageCss] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  assert.match(
    client,
    /getTenantPolicy\([\s\S]*?"tenant-activation-settings"[\s\S]*?\{ action:\s*"getPolicy" \}/,
  );
  assert.match(
    client,
    /saveTenantPolicy\([\s\S]*?managementHostname\(\{ mutation:\s*true \}\)[\s\S]*?action:\s*options\.publish \? "publishPolicy" : "updatePolicy"[\s\S]*?expectedRevision:\s*options\.expectedRevision,[\s\S]*?policy:\s*options\.policy/,
  );
  assert.match(
    client,
    /error\.code === "POLICY_REVISION_STALE" \|\| error\.status === 409[\s\S]*?"POLICY_STALE_REFRESH_REQUIRED"[\s\S]*?Refresh before saving or publishing/,
  );

  assert.match(
    managementAdapter,
    /canReadManagerSettings\s*\?\s*getTenantPolicy\(session\.access_token\)\.catch\(\(\) => null\)/,
  );
  assert.match(
    managementAdapter,
    /policyStatus:\s*policyResult === null \? "unavailable" : "available"/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "policy:update" \|\| action\.type === "policy:publish"[\s\S]*?assertVenueManager\(authority\)[\s\S]*?await getTenantPolicy\(session\.access_token\)[\s\S]*?!current\.permissions\.canManagePolicy[\s\S]*?POLICY_UPDATE_ACCESS_DENIED[\s\S]*?!current\.permissions\.canPublishPolicy[\s\S]*?POLICY_PUBLISH_ACCESS_DENIED[\s\S]*?saveTenantPolicy\(session\.access_token,[\s\S]*?publish:\s*action\.type === "policy:publish",[\s\S]*?expectedRevision:\s*policy\.expectedRevision/,
  );
  assert.match(
    managementAdapter,
    /function policyActionPayload\([\s\S]*?assertAllowedKeys\(payload, new Set\(\["expectedRevision", "policy"\]\)[\s\S]*?Number\.isFinite\(new Date\(expectedRevision\)\.getTime\(\)\)[\s\S]*?assertAllowedKeys\(policy, new Set\(\["title", "intro", "content"\]\)[\s\S]*?normalizedPolicyText\(policy\.title, 3, 180,[\s\S]*?normalizedPolicyText\(policy\.intro, 10, 1_200,[\s\S]*?normalizedPolicyText\(policy\.content, 20, 30_000/,
  );

  const rulesStart = manage.indexOf('{section === "rules" &&');
  const rulesEnd = manage.indexOf("function SettingsView(", rulesStart);
  assert.ok(rulesStart >= 0 && rulesEnd > rulesStart);
  const rulesSource = manage.slice(rulesStart, rulesEnd);
  assert.match(rulesSource, /<h2>Booking rules<\/h2>/);
  assert.match(rulesSource, /minLength=\{3\} maxLength=\{180\}/);
  assert.match(rulesSource, /minLength=\{10\} maxLength=\{1200\}/);
  assert.match(rulesSource, /minLength=\{20\} maxLength=\{30000\}/);
  assert.match(rulesSource, /<strong>Safe concurrent editing\.<\/strong>/);
  assert.match(
    rulesSource,
    /confirmLabel:\s*"Save draft",\s*actionType:\s*"policy:update",\s*payload:\s*\{ expectedRevision:\s*snapshot\.configuration\.policy!\.revision, policy:\s*policyDraft \}/,
  );
  assert.match(
    rulesSource,
    /confirmLabel:\s*"Publish rules",\s*actionType:\s*"policy:publish",\s*payload:\s*\{ expectedRevision:\s*snapshot\.configuration\.policy!\.revision, policy:\s*policyDraft \}/,
  );
  assert.match(
    rulesSource,
    /Policy service unavailable[\s\S]*?Rules could not be loaded safely\.[\s\S]*?Refresh before editing/,
  );

  assert.match(manage, /\{ id:\s*"launch", label:\s*"Launch", short:\s*"GO" \}/);
  assert.match(manage, /title:\s*`Launch \$\{activeTenant\.identity\.shortName\}`/);
  assert.match(
    manage,
    /const visibleNavItems = NAV_ITEMS\.filter\(\(item\) =>\s*item\.id !== "launch" \|\| snapshot\?\.session\.isSystemOwner === true\s*\)/,
  );
  const launchStart = manage.indexOf("function LaunchView(");
  const launchEnd = manage.indexOf("function AccessView(", launchStart);
  assert.ok(launchStart >= 0 && launchEnd > launchStart);
  const launchSource = manage.slice(launchStart, launchEnd);
  assert.match(
    launchSource,
    /if \(!snapshot\.session\.isSystemOwner\)[\s\S]*?<PermissionPanel[^>]*view="launch"/,
  );
  assert.match(launchSource, /Authoritative readiness/);
  assert.match(
    launchSource,
    /item\.id !== "setup-status" && item\.id !== "public-booking"/,
  );
  assert.match(
    launchSource,
    /const ready = launchChecks\.length > 0 && launchChecks\.every\(\(item\) => item\.complete\)/,
  );
  assert.match(
    launchSource,
    /item\.id === "email"[\s\S]*?openSettings\("business"\)[\s\S]*?>Configure email<\/button>/,
  );
  assert.match(
    launchSource,
    /item\.id === "policy"[\s\S]*?openSettings\("rules"\)[\s\S]*?>Write rules<\/button>/,
  );
  assert.match(
    managementAdapter,
    /launchRequirementsV2Required:\s*record\(settings\?\.readiness\)\?\.launchRequirementsV2Required === true/,
  );
  const readinessStart = managementAdapter.indexOf("function liveSetup(");
  const readinessEnd = managementAdapter.indexOf(
    "function deriveLiveSchedule(",
    readinessStart,
  );
  assert.ok(readinessStart >= 0 && readinessEnd > readinessStart);
  const readinessSource = managementAdapter.slice(readinessStart, readinessEnd);
  assert.match(
    readinessSource,
    /\.\.\.\(booleanValue\(readiness, "launchRequirementsV2Required"\)\s*\?\s*\[[\s\S]*?"email"[\s\S]*?"emailConfigured"[\s\S]*?"policy"[\s\S]*?"policyConfigured"[\s\S]*?: \[\]\)/,
  );
  assert.match(
    launchSource,
    /const launchChecks = snapshot\.setup\.filter/,
  );
  assert.match(
    launchSource,
    /actionType:\s*"activation:update"[\s\S]*?platformBilling:\s*\{ feeMode:\s*billing\.feeMode, feeAmount:\s*billingAmount \}/,
  );
  assert.match(launchSource, /<h2>Billing rule<\/h2>/);
  assert.match(
    launchSource,
    /actionType:\s*"remittance:update"[\s\S]*?accountName:\s*destination\.accountName,[\s\S]*?accountReference:\s*destination\.accountReference,[\s\S]*?dueDay/,
  );
  assert.match(launchSource, /<h2>Destination<\/h2>/);
  assert.match(
    launchSource,
    /publicBookingIsLive \? `\$\{activeTenant\.identity\.shortName\} is live`[\s\S]*?disabled=\{publicBookingIsLive \|\| !ready\}[\s\S]*?actionType:\s*"tenant:publish"[\s\S]*?publicBookingIsLive \? "Already live" : "Go live"/,
  );
  assert.match(
    launchSource,
    /className=\{publicBookingIsLive \|\| ready \? styles\.openTag : styles\.needsTag\}[\s\S]*?publicBookingIsLive \? "Live" : ready \? "Ready to launch" : "Setup required"/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "remittance:update"[\s\S]*?!authority\.isSystemOwner[\s\S]*?PLATFORM_OWNER_REQUIRED[\s\S]*?saveRemittanceDestination/,
  );
  assert.match(
    managementAdapter,
    /action\.type === "tenant:publish"[\s\S]*?assertNoPayload\(action\.payload\)[\s\S]*?!authority\.isSystemOwner[\s\S]*?canActivatePublicBooking[\s\S]*?activateTenantInitially/,
  );
  assert.match(
    client,
    /getRemittanceDestination\([\s\S]*?"tenant-remittance-asset"[\s\S]*?"get-destination"/,
  );
  assert.match(
    client,
    /saveRemittanceDestination\([\s\S]*?managementHostname\(\{ mutation:\s*true \}\)[\s\S]*?"tenant-remittance-asset"[\s\S]*?"save-destination"/,
  );

  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.launchChecklist,\s*\.launchEditorGrid\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
  const phoneCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    phoneCss,
    /\.compactFields,\s*\.launchEditorGrid \.compactFields\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
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
    /const \[businessRevision, setBusinessRevision\] = useState\([\s\S]*?snapshot\.configuration\.businessPayments\?\.revision \?\? ""[\s\S]*?expectedRevision:\s*businessRevision/,
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
    "function assertActiveTenantContext(",
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

test("uses secure owner-managed QR image uploads instead of exposing asset URLs", async () => {
  const [client, manage, managementAdapter, manageCss] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  assert.match(
    client,
    /export type PaymentQrAsset = \{\s*url: string;\s*contentType: "image\/jpeg" \| "image\/png" \| "image\/webp";\s*\}/,
  );
  assert.match(
    client,
    /export type PaymentQrMutation = \{\s*asset: PaymentQrAsset \| null;\s*tenantRevision: string;\s*cleanupPending: boolean;\s*\}/,
  );
  assert.match(
    client,
    /const PAYMENT_QR_METHODS = new Set\(\["gcash", "maya", "bdo", "bpi", "gotyme", "pnb"\]\)/,
  );
  const uploadStart = client.indexOf("export async function uploadTenantPaymentQr(");
  const uploadEnd = client.indexOf("export type ReceiptView", uploadStart);
  assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
  const uploadSource = client.slice(uploadStart, uploadEnd);
  assert.match(uploadSource, /managementHostname\(\{ mutation: true \}\)/);
  assert.match(uploadSource, /PAYMENT_QR_METHODS\.has\(normalizedMethod\)/);
  assert.match(
    uploadSource,
    /!\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\(file\.type\)[\s\S]*?file\.size < 1 \|\| file\.size > 2 \* 1024 \* 1024/,
  );
  assert.match(uploadSource, /form\.append\("qrFile", file\)/);
  assert.match(
    uploadSource,
    /fetch\(edgeUrl\("tenant-payment-asset"\), \{[\s\S]*?method: "POST"[\s\S]*?apikey: publicSupabaseKey[\s\S]*?Authorization: `Bearer \$\{accessToken\}`[\s\S]*?"X-Tenant-Slug": activeTenant\.identity\.slug[\s\S]*?"X-Asset-Action": "upload"[\s\S]*?"X-Payment-Method": normalizedMethod[\s\S]*?body: form/,
  );
  assert.match(
    uploadSource,
    /responseJson<\{[\s\S]*?ok: true;[\s\S]*?asset: PaymentQrAsset;[\s\S]*?tenantRevision: string;[\s\S]*?cleanupPending\?: boolean;[\s\S]*?\}>\(response\)[\s\S]*?asset: result\.asset,[\s\S]*?tenantRevision: result\.tenantRevision,[\s\S]*?cleanupPending: result\.cleanupPending === true/,
  );
  const deleteStart = uploadSource.indexOf(
    "export async function deleteTenantPaymentQr(",
  );
  assert.ok(deleteStart > 0);
  const deleteSource = uploadSource.slice(deleteStart);
  assert.match(deleteSource, /managementHostname\(\{ mutation: true \}\)/);
  assert.match(
    deleteSource,
    /fetch\(edgeUrl\("tenant-payment-asset"\), \{[\s\S]*?"X-Asset-Action": "delete"[\s\S]*?"X-Payment-Method": normalizedMethod/,
  );
  assert.match(
    deleteSource,
    /asset: null;[\s\S]*?tenantRevision: string;[\s\S]*?asset: null,[\s\S]*?tenantRevision: result\.tenantRevision/,
  );

  const assetGuardStart = managementAdapter.indexOf(
    "function assertPaymentAssetManager(",
  );
  const assetGuardEnd = managementAdapter.indexOf(
    "function assertBookingManager(",
    assetGuardStart,
  );
  assert.ok(assetGuardStart >= 0 && assetGuardEnd > assetGuardStart);
  assert.match(
    managementAdapter.slice(assetGuardStart, assetGuardEnd),
    /!session\.isSystemOwner && session\.membershipRole !== "owner"[\s\S]*?PAYMENT_ASSET_ACCESS_DENIED/,
  );

  const adapterUploadStart = managementAdapter.indexOf(
    "async uploadPaymentQr(context, methodCode, file)",
  );
  const adapterUploadEnd = managementAdapter.indexOf(
    "async perform(context, action)",
    adapterUploadStart,
  );
  assert.ok(adapterUploadStart >= 0 && adapterUploadEnd > adapterUploadStart);
  const adapterUpload = managementAdapter.slice(
    adapterUploadStart,
    adapterUploadEnd,
  );
  assert.match(
    adapterUpload,
    /currentOwnerSession\(\)[\s\S]*?getManagerSession\(session\.access_token\)[\s\S]*?assertPaymentAssetManager\(authority\)/,
  );
  assert.match(
    adapterUpload,
    /const result = await uploadTenantPaymentQr\([\s\S]*?session\.access_token,[\s\S]*?paymentQrMethodCode\(methodCode\),[\s\S]*?file[\s\S]*?const asset = result\.asset/,
  );
  assert.match(
    adapterUpload,
    /!asset \|\| !isAllowedCustomerQrUrl\(asset\.url\) \|\|[\s\S]*?!\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\(asset\.contentType\) \|\|[\s\S]*?!validIsoRevision\(result\.tenantRevision\)[\s\S]*?PAYMENT_ASSET_RESPONSE_INVALID/,
  );
  assert.match(
    adapterUpload,
    /return \{\s*url: asset\.url,\s*contentType: asset\.contentType,\s*tenantRevision: result\.tenantRevision,?\s*\}/,
  );

  const authorityStart = managementAdapter.indexOf(
    "function authorityCapabilities(",
  );
  const authorityEnd = managementAdapter.indexOf(
    "function exactInteger(",
    authorityStart,
  );
  const authoritySource = managementAdapter.slice(authorityStart, authorityEnd);
  assert.equal(
    (authoritySource.match(/"payment:asset"/g) ?? []).length,
    2,
    "expected only System Owner and tenant owner to receive QR asset authority",
  );
  assert.match(
    managementAdapter,
    /"payment:asset": serverSession\.isSystemOwner \|\|\s*serverSession\.membershipRole === "owner"/,
  );

  const uploadUiStart = manage.indexOf("const uploadQrForMethod = async (");
  const uploadUiEnd = manage.indexOf("const schedulePayload", uploadUiStart);
  assert.ok(uploadUiStart >= 0 && uploadUiEnd > uploadUiStart);
  const uploadUi = manage.slice(uploadUiStart, uploadUiEnd);
  assert.match(
    uploadUi,
    /!\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\(file\.type\)[\s\S]*?file\.size < 1 \|\| file\.size > 2 \* 1024 \* 1024/,
  );
  assert.match(uploadUi, /PAYMENT_QR_METHOD_CODES\.has\(methodCode\)/);
  assert.match(
    uploadUi,
    /await uploadPaymentQr\(methodCode, file\)[\s\S]*?setPaymentField\(index, "qrUrl", asset\.url\)[\s\S]*?setBusinessRevision\(asset\.tenantRevision\)/,
  );
  assert.match(uploadUi, /QR image saved\. It is now attached to this customer payment method\./);
  assert.doesNotMatch(uploadUi, /Save Business & payments/);

  const qrEditorStart = manage.indexOf(
    "<div className={cx(styles.paymentQrEditor, styles.fieldWide)}>",
  );
  const qrEditorEnd = manage.indexOf(
    '<label className={styles.field}><span>Sort order</span>',
    qrEditorStart,
  );
  assert.ok(qrEditorStart >= 0 && qrEditorEnd > qrEditorStart);
  const qrEditor = manage.slice(qrEditorStart, qrEditorEnd);
  assert.doesNotMatch(manage, /QR image URL/i);
  assert.doesNotMatch(
    qrEditor,
    /<input[^>]*(?:type="url"|value=\{method\.qrUrl\})/s,
  );
  assert.match(
    qrEditor,
    /<input[\s\S]*?type="file"[\s\S]*?accept="image\/jpeg,image\/png,image\/webp"[\s\S]*?disabled=\{!can\("payment:asset"\)[\s\S]*?onChange=/,
  );
  assert.match(qrEditor, /event\.currentTarget\.value = ""/);
  assert.match(qrEditor, /method\.qrUrl \? "Replace image" : "Upload image"/);
  assert.match(
    qrEditor,
    /actionType: "payment:asset-remove"[\s\S]*?payload: \{ methodCode: method\.originalMethodCode \?\? method\.methodCode \}[\s\S]*?Remove from checkout/,
  );
  assert.match(manage, /readOnly=\{method\.originalMethodCode !== null\}[\s\S]*?Locked after the payment method is saved/);
  assert.match(qrEditor, /maximum 2 MB[\s\S]*?owner access required/);

  assert.match(
    cssBlock(manageCss, ".paymentQrEditor"),
    /grid-template-columns:\s*minmax\(126px, 152px\) minmax\(0, 1fr\)/,
  );
  const phoneCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    phoneCss,
    /\.paymentQrEditor\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    phoneCss,
    /\.paymentQrControls \.inlineActions\s*\{[^}]*flex-direction:\s*column/s,
  );
});

test("keeps payment review private, minimal, role-checked, and decision-safe", async () => {
  const [client, manage, managementAdapter, manageCss] = await Promise.all([
    readFile(files.client, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  const evidenceTypeStart = managementAdapter.indexOf(
    "export type PaymentEvidence = {",
  );
  const evidenceTypeEnd = managementAdapter.indexOf(
    "export type PaymentReceiptView = {",
    evidenceTypeStart,
  );
  assert.ok(evidenceTypeStart >= 0 && evidenceTypeEnd > evidenceTypeStart);
  const evidenceType = managementAdapter.slice(evidenceTypeStart, evidenceTypeEnd);
  assert.match(
    evidenceType,
    /submittedReference:\s*string \| null;[\s\S]*?detectedReference:\s*string \| null;[\s\S]*?detectedAmounts:\s*number\[\];/,
  );
  assert.doesNotMatch(
    evidenceType,
    /storage(?:_path|Path)|file_hash|sha256|raw_ocr|rawOcr|ocr_text|ocrText/i,
  );

  const mapperStart = managementAdapter.indexOf("function latestPaymentEvidence(");
  const mapperEnd = managementAdapter.indexOf("function mapLiveBooking(", mapperStart);
  assert.ok(mapperStart >= 0 && mapperEnd > mapperStart);
  const evidenceMapper = managementAdapter.slice(mapperStart, mapperEnd);
  assert.match(evidenceMapper, /Array\.isArray\(row\.receipt_verifications\)/);
  assert.match(
    evidenceMapper,
    /const detectedReference = value\(candidate, \["payment_reference", "paymentReference"\]\)/,
  );
  assert.match(
    evidenceMapper,
    /const submittedReference = providerPayload[\s\S]*?value\(providerPayload, \["submittedReference", "submitted_reference"\]\)/,
  );
  assert.match(
    evidenceMapper,
    /Array\.isArray\(detected\?\.amounts\)[\s\S]*?amount >= 0 && amount <= 10_000_000[\s\S]*?\.slice\(0, 10\)/,
  );
  assert.match(
    evidenceMapper,
    /reviewable: status === "manual_review" && bookingStatus === "payment_review" &&\s*paymentStatus === "pending"/,
  );
  assert.doesNotMatch(
    evidenceMapper,
    /storage(?:_path|Path)|file_hash|sha256|raw_ocr|rawOcr|ocr_text|ocrText/i,
  );

  assert.match(
    client,
    /getPaymentReceiptView\([\s\S]*?"get-receipt-view-url"[\s\S]*?\{ verificationId \}/,
  );
  assert.match(
    client,
    /reviewPaymentReceipt\([\s\S]*?managementHostname\(\{ mutation: true \}\)[\s\S]*?"review-payment-receipt"[\s\S]*?input/,
  );

  const signedGuardStart = managementAdapter.indexOf(
    "function isAllowedReceiptViewUrl(",
  );
  const signedGuardEnd = managementAdapter.indexOf(
    "function paymentEvidenceStatus(",
    signedGuardStart,
  );
  assert.ok(signedGuardStart >= 0 && signedGuardEnd > signedGuardStart);
  const signedGuard = managementAdapter.slice(signedGuardStart, signedGuardEnd);
  assert.match(
    managementAdapter,
    /const PRIVATE_RECEIPT_VIEW_PREFIX =\s*"\/storage\/v1\/object\/sign\/tenant-private\/"/,
  );
  assert.match(
    signedGuard,
    /url\.protocol === "https:" && !url\.username && !url\.password && !url\.port &&\s*!url\.hash && url\.origin === SHARED_SUPABASE_ORIGIN/,
  );
  assert.match(
    signedGuard,
    /url\.pathname\.startsWith\(PRIVATE_RECEIPT_VIEW_PREFIX\)[\s\S]*?Boolean\(url\.searchParams\.get\("token"\)\)/,
  );

  const receiptLoadStart = managementAdapter.indexOf(
    "async loadPaymentReceipt(context, verificationId)",
  );
  const receiptLoadEnd = managementAdapter.indexOf(
    "async uploadPaymentQr(context, methodCode, file)",
    receiptLoadStart,
  );
  assert.ok(receiptLoadStart >= 0 && receiptLoadEnd > receiptLoadStart);
  const receiptLoad = managementAdapter.slice(receiptLoadStart, receiptLoadEnd);
  assert.match(
    receiptLoad,
    /currentOwnerSession\(\)[\s\S]*?getManagerSession\(session\.access_token\)[\s\S]*?assertPaymentReviewer\(authority\)/,
  );
  assert.match(
    receiptLoad,
    /requiredUuid\(verificationId, "RECEIPT_VERIFICATION_ID_INVALID"\)[\s\S]*?getPaymentReceiptView\(session\.access_token, id\)/,
  );
  assert.match(
    receiptLoad,
    /result\.receipt\?\.verificationId !== id \|\| !status \|\|[\s\S]*?result\.expiresIn < 30 \|\|[\s\S]*?result\.expiresIn > 600 \|\| !isAllowedReceiptViewUrl\(result\.signedUrl\)/,
  );

  const reviewerGuardStart = managementAdapter.indexOf(
    "function assertPaymentReviewer(",
  );
  const reviewerGuardEnd = managementAdapter.indexOf(
    "function assertPaymentAssetManager(",
    reviewerGuardStart,
  );
  assert.ok(reviewerGuardStart >= 0 && reviewerGuardEnd > reviewerGuardStart);
  assert.match(
    managementAdapter.slice(reviewerGuardStart, reviewerGuardEnd),
    /!session\.isSystemOwner && session\.membershipRole !== "owner" &&\s*session\.membershipRole !== "admin" && session\.membershipRole !== "staff"[\s\S]*?PAYMENT_REVIEW_ACCESS_DENIED/,
  );

  const authorityStart = managementAdapter.indexOf(
    "function authorityCapabilities(",
  );
  const authorityEnd = managementAdapter.indexOf(
    "function exactInteger(",
    authorityStart,
  );
  const authority = managementAdapter.slice(authorityStart, authorityEnd);
  assert.equal(
    (authority.match(/"payment:review"/g) ?? []).length,
    4,
    "expected System Owner, owner, admin, and staff payment-review authority",
  );

  const reviewActionStart = managementAdapter.indexOf(
    'if (action.type === "payment:approve" || action.type === "payment:reject")',
  );
  const reviewActionEnd = managementAdapter.indexOf(
    'action.type === "booking:create"',
    reviewActionStart,
  );
  assert.ok(reviewActionStart >= 0 && reviewActionEnd > reviewActionStart);
  const reviewAction = managementAdapter.slice(reviewActionStart, reviewActionEnd);
  assert.match(reviewAction, /assertPaymentReviewer\(authority\)/);
  assert.match(
    reviewAction,
    /requiredUuid\([\s\S]*?action\.resourceId,[\s\S]*?"RECEIPT_VERIFICATION_ID_INVALID"/,
  );
  assert.match(
    reviewAction,
    /paymentReviewNote\(action\.payload, action\.type === "payment:reject"\)/,
  );
  assert.match(
    reviewAction,
    /reviewPaymentReceipt\(session\.access_token, \{[\s\S]*?verificationId,[\s\S]*?decision: action\.type === "payment:approve" \? "approve" : "reject",[\s\S]*?note/,
  );
  assert.match(
    reviewAction,
    /action\.type === "payment:approve"[\s\S]*?The receipt was approved and the booking is confirmed\.[\s\S]*?The receipt was rejected\. The server updated the booking or balance-payment state\./,
  );
  const rejectedResultCopy = reviewAction.match(
    /"The receipt was rejected\.[^"\r\n]+"/,
  )?.[0] ?? "";
  assert.ok(rejectedResultCopy);
  assert.doesNotMatch(rejectedResultCopy, /cancel|release|slot|court time/i);

  const noteGuardStart = managementAdapter.indexOf("function paymentReviewNote(");
  const noteGuardEnd = managementAdapter.indexOf(
    "function assertNoPayload(",
    noteGuardStart,
  );
  assert.ok(noteGuardStart >= 0 && noteGuardEnd > noteGuardStart);
  const noteGuard = managementAdapter.slice(noteGuardStart, noteGuardEnd);
  assert.match(
    noteGuard,
    /assertAllowedKeys\(payload, new Set\(\["note"\]\), "PAYMENT_REVIEW_INPUT_INVALID"\)/,
  );
  assert.match(
    noteGuard,
    /\(required && note\.length < 3\) \|\| note\.length > 1_000 \|\|[\s\S]*?PAYMENT_REVIEW_NOTE_INVALID/,
  );

  const reviewUiStart = manage.indexOf("function PaymentReviewWorkspace(");
  const reviewUiEnd = manage.indexOf("function BookingsView(", reviewUiStart);
  assert.ok(reviewUiStart >= 0 && reviewUiEnd > reviewUiStart);
  const reviewUi = manage.slice(reviewUiStart, reviewUiEnd);
  const bookingsUiStart = reviewUiEnd;
  const bookingsUiEnd = manage.indexOf("function ScheduleView(", bookingsUiStart);
  assert.ok(bookingsUiEnd > bookingsUiStart);
  const bookingsUi = manage.slice(bookingsUiStart, bookingsUiEnd);
  assert.match(
    manage,
    /type BookingFilter =[\s\S]*?\| "all"[\s\S]*?\| "awaiting"[\s\S]*?\| "pending"[\s\S]*?\| "confirmed"[\s\S]*?\| "completed"[\s\S]*?\| "cancelled";/,
  );
  assert.match(
    manage,
    /const BOOKING_FILTERS:[\s\S]*?value: "all", label: "All"[\s\S]*?value: "awaiting", label: "Awaiting"[\s\S]*?value: "pending", label: "Pending"[\s\S]*?value: "confirmed", label: "Confirmed"[\s\S]*?value: "completed", label: "Completed"[\s\S]*?value: "cancelled", label: "Cancelled"/,
  );
  assert.match(bookingsUi, /useState<BookingFilter>\(initialStatus\)/);
  assert.match(
    manage,
    /function bookingMatchesFilter[\s\S]*?filter === "pending"[\s\S]*?booking\.status === "receipt_processing"[\s\S]*?booking\.status === "payment_review"[\s\S]*?booking\.status === "payment_attention"/,
  );
  assert.match(
    bookingsUi,
    /BOOKING_FILTERS\.map\(\(filter\) => \([\s\S]*?aria-pressed=\{status === filter\.value\}[\s\S]*?filterCounts\[filter\.value\]/,
  );
  assert.match(
    bookingsUi,
    /booking\.paymentEvidence\?\.reviewable && !terminal[\s\S]*?disabled=\{!canReviewPayments\}[\s\S]*?>\s*Review payment\s*<\/button>/,
  );
  assert.match(
    reviewUi,
    /className=\{styles\.paymentReviewWorkspace\}[\s\S]*?Private payment evidence[\s\S]*?Opening the private receipt/,
  );
  assert.match(
    reviewUi,
    /const verificationId = evidence\?\.verificationId \?\? null;[\s\S]*?if \(!verificationId \|\| !evidence\?\.reviewable\) return;[\s\S]*?loadPaymentReceipt\(verificationId\)[\s\S]*?setReceiptView\(view\)[\s\S]*?setReceiptState\("ready"\)[\s\S]*?\[evidence\?\.reviewable, loadPaymentReceipt, receiptReload, verificationId\]/,
  );
  assert.match(
    reviewUi,
    /src=\{receiptView\.signedUrl\}[\s\S]*?Payment receipt submitted for booking[\s\S]*?Open full image/,
  );
  assert.match(
    reviewUi,
    /Player-entered reference[\s\S]*?evidence\.submittedReference[\s\S]*?Receipt-detected reference[\s\S]*?evidence\.detectedReference[\s\S]*?Amounts detected[\s\S]*?evidence\.detectedAmounts/,
  );
  assert.doesNotMatch(reviewUi, /received amount/i);
  assert.match(
    reviewUi,
    /disabled=\{!can\("payment:review"\) \|\| receiptState !== "ready" \|\| receiptView\?\.status !== "manual_review" \|\| reviewNote\.trim\(\)\.length < 3\}[\s\S]*?actionType: "payment:reject"[\s\S]*?resourceId: evidence\.verificationId/,
  );
  assert.match(
    reviewUi,
    /disabled=\{!can\("payment:review"\) \|\| receiptState !== "ready" \|\| receiptView\?\.status !== "manual_review"\}[\s\S]*?actionType: "payment:approve"[\s\S]*?resourceId: evidence\.verificationId/,
  );
  assert.match(
    reviewUi,
    /headingLevel = "h3"[\s\S]*?headingLevel\?: "h2" \| "h3";[\s\S]*?const ReviewHeading = headingLevel;[\s\S]*?<ReviewHeading id="payment-review-title" ref=\{reviewHeadingRef\} tabIndex=\{-1\}>/,
  );
  const rejectCopyStart = reviewUi.indexOf("title: `Reject payment");
  const rejectCopyEnd = reviewUi.indexOf(
    "title: `Approve ",
    rejectCopyStart,
  );
  assert.ok(rejectCopyStart >= 0 && rejectCopyEnd > rejectCopyStart);
  const rejectCopy = reviewUi.slice(rejectCopyStart, rejectCopyEnd);
  assert.match(
    rejectCopy,
    /receipt will be rejected\.[\s\S]*?server will update the booking or balance request according to its current state[\s\S]*?confirmLabel: "Reject receipt"[\s\S]*?>\s*Reject receipt/s,
  );
  assert.doesNotMatch(rejectCopy, /cancel|release(?:d|s)?(?:\s+the)?\s+(?:slot|court)|held court time/i);
  assert.match(reviewUi, /requestAnimationFrame\(\(\) => reviewHeadingRef\.current\?\.focus\(\)\)/);
  assert.match(
    bookingsUi,
    /const \[reviewingBookingId, setReviewingBookingId\] = useState<string \| null>\(null\)[\s\S]*?const reviewing = reviewingBookingId[\s\S]*?bookings\.find\(\(booking\) =>[\s\S]*?booking\.bookingId === reviewingBookingId && booking\.paymentEvidence\?\.reviewable === true/,
  );
  assert.match(
    bookingsUi,
    /reviewReturnRef\.current = trigger;[\s\S]*?setReviewingBookingId\(booking\.bookingId\)/,
  );
  assert.match(
    bookingsUi,
    /const returnTarget = reviewReturnRef\.current;[\s\S]*?setReviewingBookingId\(null\);[\s\S]*?returnTarget\?\.isConnected[\s\S]*?bookingListHeadingRef\.current\?\.focus\(\)/,
  );
  assert.match(
    bookingsUi,
    /if \(!reviewingBookingId \|\| \(reviewing && canReviewPayments\)\) return;[\s\S]*?setReviewingBookingId\(null\);[\s\S]*?bookingListHeadingRef\.current\?\.focus\(\)[\s\S]*?\[canReviewPayments, reviewing, reviewingBookingId\]/,
  );
  assert.match(
    bookingsUi,
    /<h2 id="booking-list-title" ref=\{bookingListHeadingRef\} tabIndex=\{-1\}>/,
  );

  assert.match(
    cssBlock(manageCss, ".paymentReviewLayout"),
    /grid-template-columns:\s*minmax\(280px, \.9fr\) minmax\(340px, 1\.1fr\)/,
  );
  assert.match(
    cssBlock(manageCss, ".spinner"),
    /animation:\s*receipt-spin 760ms linear infinite/,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.paymentReviewLayout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  const phoneCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    phoneCss,
    /\.paymentFacts\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    phoneCss,
    /\.paymentReviewActions > div\s*\{[^}]*flex-direction:\s*column/s,
  );
  const reducedMotionCss = cssBlock(
    manageCss,
    "@media (prefers-reduced-motion: reduce)",
  );
  assert.match(
    reducedMotionCss,
    /\.manageShell \*[\s\S]*?animation-duration:\s*\.01ms !important[\s\S]*?animation-iteration-count:\s*1 !important/,
  );
});

test("shows truthful payment stages in a modern Overview inbox and refreshes only live operational views", async () => {
  const [booking, manage, managementAdapter, manageCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
    readFile(files.manageCss, "utf8"),
  ]);

  const bookingStatusStart = managementAdapter.indexOf(
    "export type BookingStatus =",
  );
  const bookingStatusEnd = managementAdapter.indexOf(
    "export type BookingPaymentStatus =",
    bookingStatusStart,
  );
  assert.ok(bookingStatusStart >= 0 && bookingStatusEnd > bookingStatusStart);
  const bookingStatuses = managementAdapter.slice(
    bookingStatusStart,
    bookingStatusEnd,
  );
  for (const status of [
    "awaiting_receipt",
    "receipt_processing",
    "payment_review",
    "payment_attention",
    "cancelled",
    "expired",
  ]) {
    assert.match(bookingStatuses, new RegExp(`\\| "${status}"`));
  }
  assert.doesNotMatch(bookingStatuses, /awaiting_payment/);

  const evidenceStatusStart = managementAdapter.indexOf(
    "export type PaymentEvidenceStatus =",
  );
  const evidenceStatusEnd = managementAdapter.indexOf(
    "export type PaymentEvidence =",
    evidenceStatusStart,
  );
  assert.ok(evidenceStatusStart >= 0 && evidenceStatusEnd > evidenceStatusStart);
  assert.match(
    managementAdapter.slice(evidenceStatusStart, evidenceStatusEnd),
    /\| "pending"[\s\S]*?\| "manual_review"[\s\S]*?\| "short_payment"/,
  );

  const liveStatusStart = managementAdapter.indexOf("function liveStatus(");
  const liveStatusEnd = managementAdapter.indexOf(
    "function initialsFor(",
    liveStatusStart,
  );
  assert.ok(liveStatusStart >= 0 && liveStatusEnd > liveStatusStart);
  const liveStatus = managementAdapter.slice(liveStatusStart, liveStatusEnd);
  assert.match(
    liveStatus,
    /if \(status === "cancelled"\) return "cancelled";[\s\S]*?if \(status === "expired"\) return "expired";[\s\S]*?if \(status === "completed"\) return "completed";[\s\S]*?if \(value\(row, \["checked_in_at"\]\)\) return "checked_in";[\s\S]*?if \(status === "confirmed"\) return "confirmed";/,
  );
  assert.match(
    liveStatus,
    /if \(status === "pending_payment" \|\| status === "payment_review"\)[\s\S]*?if \(paymentEvidence\?\.status === "pending"\) \{[\s\S]*?return payment === "unpaid" \|\| payment === "pending"[\s\S]*?\? "receipt_processing"[\s\S]*?: "payment_attention";/,
  );
  assert.match(
    liveStatus,
    /if \(status === "pending_payment" && !paymentEvidence\) \{[\s\S]*?if \(payment === "unpaid"\) return "awaiting_receipt";[\s\S]*?if \(payment === "pending"\) return "receipt_processing";[\s\S]*?return "payment_attention";/,
  );
  assert.match(
    liveStatus,
    /status === "payment_review" &&[\s\S]*?paymentEvidence\?\.status === "manual_review" &&[\s\S]*?payment === "pending"[\s\S]*?return "payment_review"/,
  );
  assert.match(liveStatus, /return "payment_attention";[\s\S]*?LIVE_BOOKING_STATUS_INVALID/);
  assert.doesNotMatch(liveStatus, /awaiting_payment/);
  assert.match(
    managementAdapter,
    /const payment = livePaymentStatus\(paymentStatus\);[\s\S]*?const paymentEvidence = latestPaymentEvidence\(row, bookingStatus, paymentStatus\);[\s\S]*?status: liveStatus\(row, payment, paymentEvidence\)/,
  );

  const checkoutSubmitStart = booking.indexOf("async submitPayment(request)");
  const checkoutSubmitEnd = booking.indexOf("async findBooking(", checkoutSubmitStart);
  assert.ok(checkoutSubmitStart >= 0 && checkoutSubmitEnd > checkoutSubmitStart);
  const checkoutSubmit = booking.slice(checkoutSubmitStart, checkoutSubmitEnd);
  assert.match(
    checkoutSubmit,
    /const verificationStatus = typeof receipt\.status === "string"[\s\S]*?typeof receipt\.outcome === "string"[\s\S]*?verificationStatus === "auto_approved"[\s\S]*?"confirmed"/,
  );
  assert.doesNotMatch(checkoutSubmit, /const outcome = typeof receipt\.outcome/);

  const statusLabelsStart = manage.indexOf(
    "const STATUS_LABEL: Record<BookingStatus, string> =",
  );
  const statusLabelsEnd = manage.indexOf(
    "const PAYMENT_LABEL:",
    statusLabelsStart,
  );
  assert.ok(statusLabelsStart >= 0 && statusLabelsEnd > statusLabelsStart);
  const statusLabels = manage.slice(statusLabelsStart, statusLabelsEnd);
  assert.match(statusLabels, /awaiting_receipt: "Awaiting receipt"/);
  assert.match(statusLabels, /receipt_processing: "Receipt processing"/);
  assert.match(statusLabels, /payment_review: "Review required"/);
  assert.match(statusLabels, /payment_attention: "Payment needs attention"/);
  assert.match(statusLabels, /cancelled: "Cancelled"/);
  assert.match(statusLabels, /expired: "Expired"/);
  assert.doesNotMatch(statusLabels, /Awaiting payment/i);

  const overviewStart = manage.indexOf("function OverviewView(");
  const overviewEnd = manage.indexOf(
    "function PaymentReviewWorkspace(",
    overviewStart,
  );
  assert.ok(overviewStart >= 0 && overviewEnd > overviewStart);
  const overview = manage.slice(overviewStart, overviewEnd);
  assert.match(
    overview,
    /const reviewQueue = snapshot\.bookings\.filter[\s\S]*?paymentEvidence\?\.reviewable === true[\s\S]*?const processingQueue = snapshot\.bookings\.filter[\s\S]*?booking\.status === "receipt_processing"[\s\S]*?const awaitingReceiptQueue = snapshot\.bookings\.filter[\s\S]*?booking\.status === "awaiting_receipt"[\s\S]*?const paymentAttentionQueue = snapshot\.bookings\.filter[\s\S]*?booking\.status === "payment_attention"/,
  );
  assert.match(
    overview,
    /const inboxBooking = reviewQueue\[0\] \?\? processingQueue\[0\] \?\?[\s\S]*?paymentAttentionQueue\[0\] \?\? awaitingReceiptQueue\[0\] \?\? null/,
  );
  assert.match(
    overview,
    /className=\{cx\(styles\.paymentInbox,[\s\S]*?aria-labelledby="payment-inbox-title"[\s\S]*?>Payment inbox<[\s\S]*?ready for review[\s\S]*?A receipt is being checked[\s\S]*?Waiting for player receipts/,
  );
  assert.match(
    overview,
    /aria-label="Payment queue counts" aria-live="polite"[\s\S]*?reviewQueue\.length[\s\S]*?To review[\s\S]*?processingQueue\.length[\s\S]*?Processing[\s\S]*?paymentAttentionQueue\.length[\s\S]*?Attention[\s\S]*?awaitingReceiptQueue\.length[\s\S]*?Awaiting receipt/,
  );
  assert.match(
    overview,
    /<dl className=\{styles\.paymentInboxFacts\}>[\s\S]*?Expected total[\s\S]*?expectedAmount \?\? inboxBooking\.amount[\s\S]*?Court & session[\s\S]*?inboxBooking\.court[\s\S]*?inboxBooking\.date[\s\S]*?inboxBooking\.time[\s\S]*?Receipt submitted[\s\S]*?inboxBooking\.paymentEvidence\?\.submittedAt/,
  );
  assert.match(
    overview,
    /inboxBooking\.paymentEvidence\?\.reviewable[\s\S]*?disabled=\{!canReviewPayments\}[\s\S]*?reviewReturnRef\.current = event\.currentTarget;[\s\S]*?setReviewingBookingId\(inboxBooking\.bookingId\)[\s\S]*?Review payment/,
  );
  assert.match(
    overview,
    /!isPreview && canReviewPayments && reviewWorkspace[\s\S]*?<PaymentReviewWorkspace[\s\S]*?key=\{reviewWorkspace!\.evidence\.verificationId\}[\s\S]*?booking=\{reviewWorkspace!\.booking\}[\s\S]*?loadPaymentReceipt=\{loadPaymentReceipt\}[\s\S]*?headingLevel="h2"/,
  );
  assert.match(
    overview,
    /const \[reviewingBookingId, setReviewingBookingId\] = useState<string \| null>\(null\)[\s\S]*?const paymentInboxHeadingRef = useRef<HTMLHeadingElement>\(null\);[\s\S]*?const canReviewPayments = can\("payment:review"\)[\s\S]*?const reviewing = reviewingBookingId[\s\S]*?snapshot\.bookings\.find\(\(booking\) =>[\s\S]*?booking\.bookingId === reviewingBookingId && booking\.paymentEvidence\?\.reviewable === true/,
  );
  assert.match(
    overview,
    /const returnTarget = reviewReturnRef\.current;[\s\S]*?setReviewingBookingId\(null\);[\s\S]*?returnTarget\?\.isConnected[\s\S]*?paymentInboxHeadingRef\.current\?\.focus\(\)/,
  );
  assert.match(
    overview,
    /if \(!reviewingBookingId \|\| \(reviewing && canReviewPayments\)\) return;[\s\S]*?setReviewingBookingId\(null\);[\s\S]*?paymentInboxHeadingRef\.current\?\.focus\(\)[\s\S]*?\[canReviewPayments, reviewing, reviewingBookingId\]/,
  );
  assert.match(
    overview,
    /<h2 id="payment-inbox-title" ref=\{paymentInboxHeadingRef\} tabIndex=\{-1\}>/,
  );
  assert.doesNotMatch(
    overview,
    /Private receipt images open only when you choose Review payment|Overview and Bookings refresh automatically while visible/,
  );
  assert.doesNotMatch(overview, /src=\{[^}]*signedUrl/);

  const bookingsStart = manage.indexOf("function BookingsView(");
  const bookingsEnd = manage.indexOf("function ScheduleView(", bookingsStart);
  assert.ok(bookingsStart >= 0 && bookingsEnd > bookingsStart);
  const bookingsUi = manage.slice(bookingsStart, bookingsEnd);
  assert.match(
    bookingsUi,
    /BOOKING_FILTERS\.map\(\(filter\) => \([\s\S]*?<button[\s\S]*?aria-pressed=\{status === filter\.value\}[\s\S]*?<span>\{filter\.label\}<\/span>[\s\S]*?<strong>\{filterCounts\[filter\.value\]\}<\/strong>/,
  );
  assert.match(
    manage,
    /const BOOKING_FILTERS:[\s\S]*?value: "all", label: "All"[\s\S]*?value: "awaiting", label: "Awaiting"[\s\S]*?value: "pending", label: "Pending"[\s\S]*?value: "confirmed", label: "Confirmed"[\s\S]*?value: "completed", label: "Completed"[\s\S]*?value: "cancelled", label: "Cancelled"/,
  );
  assert.match(
    bookingsUi,
    /const filterCounts = BOOKING_FILTERS\.reduce<Record<BookingFilter, number>>\([\s\S]*?bookings\.filter\(\(booking\) => bookingMatchesFilter\(booking, filter\.value\)\)\.length[\s\S]*?all: 0, awaiting: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0/,
  );
  assert.match(
    bookingsUi,
    /<strong>\{filtered\.length\}<\/strong> of \{bookings\.length\} \{bookings\.length === 1 \? "booking" : "bookings"\}/,
  );
  assert.match(
    bookingsUi,
    /<ol className=\{styles\.bookingRecordList\} aria-label="Booking results">[\s\S]*?<article className=\{styles\.bookingRecord\}[\s\S]*?bookingRecordIdentity[\s\S]*?bookingRecordSession[\s\S]*?bookingRecordPayment[\s\S]*?bookingRecordFooter/,
  );
  assert.doesNotMatch(bookingsUi, /<table\b|role="table"|className=\{styles\.dataTable\}/i);
  assert.doesNotMatch(bookingsUi, /booking:check-in|>\s*Check in\s*</i);
  assert.match(
    manage,
    /function bookingMatchesFilter[\s\S]*?filter === "pending"[\s\S]*?"receipt_processing"[\s\S]*?"payment_review"[\s\S]*?"payment_attention"[\s\S]*?filter === "confirmed"[\s\S]*?"checked_in"[\s\S]*?filter === "completed"[\s\S]*?"cancelled" \|\| booking\.status === "expired"/,
  );

  const liveOverviewStart = manage.indexOf("function OverviewView(");
  const liveOverviewEnd = manage.indexOf("function PaymentReviewWorkspace(", liveOverviewStart);
  const liveOverview = manage.slice(liveOverviewStart, liveOverviewEnd);
  assert.match(
    liveOverview,
    /const operationalBookings = snapshot\.bookings\.filter\([\s\S]*?booking\.status !== "cancelled" && booking\.status !== "expired"[\s\S]*?const loadedBookings = operationalBookings\.slice\(0, 3\)/,
  );
  assert.match(
    liveOverview,
    /const paidRevenue = operationalBookings[\s\S]*?const paidCount = operationalBookings\.filter[\s\S]*?<MetricCard label="Active bookings" value=\{String\(operationalBookings\.length\)\}[\s\S]*?operationalBookings\.length - paidCount/,
  );
  const scheduleMapperStart = managementAdapter.indexOf("function deriveLiveSchedule(");
  const scheduleMapperEnd = managementAdapter.indexOf("type CustomerAccumulator", scheduleMapperStart);
  assert.ok(scheduleMapperStart >= 0 && scheduleMapperEnd > scheduleMapperStart);
  assert.match(
    managementAdapter.slice(scheduleMapperStart, scheduleMapperEnd),
    /bookingRows[\s\S]*?\.filter\(\(row\) => \{[\s\S]*?status !== "cancelled" && status !== "expired"[\s\S]*?\.map\(\(row\) =>/,
  );

  assert.ok(
    (managementAdapter.match(
      /listManagerBookings\(session\.access_token, \{ activeOnly: false, limit: 500 \}\)/g,
    ) ?? []).length >= 2,
    "expected initial and operational booking loads to include terminal history for workflow filtering",
  );

  assert.match(
    managementAdapter,
    /export interface ManagementAdapter \{[\s\S]*?refreshOperations\([\s\S]*?context: ManagementContext,[\s\S]*?current: ManagementSnapshot,[\s\S]*?\): Promise<ManagementSnapshot>;/,
  );
  const operationsStart = managementAdapter.indexOf(
    "async refreshOperations(context, current)",
  );
  const operationsEnd = managementAdapter.indexOf(
    "async loadPaymentReceipt(context, verificationId)",
    operationsStart,
  );
  assert.ok(operationsStart >= 0 && operationsEnd > operationsStart);
  const operationsRefresh = managementAdapter.slice(
    operationsStart,
    operationsEnd,
  );
  assert.match(
    operationsRefresh,
    /platformMode\(\) === "preview"[\s\S]*?assertActiveTenantContext\(context\)[\s\S]*?current\.tenant\.mode !== "live"[\s\S]*?current\.tenant\.slug !== activeTenant\.identity\.slug[\s\S]*?LIVE_TENANT_SCOPE_MISMATCH/,
  );
  assert.match(
    operationsRefresh,
    /currentOwnerSession\(\)[\s\S]*?Promise\.all\(\[[\s\S]*?getManagerSession\(session\.access_token\)[\s\S]*?listManagerBookings\(session\.access_token, \{ activeOnly: false, limit: 500 \}\)[\s\S]*?\]\)/,
  );
  assert.doesNotMatch(
    operationsRefresh,
    /listManagerBlocks|getActivationSettings|getManagerCourts|getTenantPolicy|getRemittanceDestination/,
  );
  assert.match(
    operationsRefresh,
    /return \{\s*\.\.\.current,[\s\S]*?tenant: \{\s*\.\.\.current\.tenant,[\s\S]*?lastSynced:[\s\S]*?bookings,[\s\S]*?customers: deriveLiveCustomers\(bookingRows, courtNames\),[\s\S]*?session: \{[\s\S]*?capabilities: authorityCapabilities\(serverSession\)/,
  );
  assert.doesNotMatch(
    operationsRefresh,
    /\b(?:schedule|blocks|setup|configuration):/,
  );

  const refreshStart = manage.indexOf(
    "const refreshWorkspace = useCallback(async (announce = false) =>",
  );
  const refreshEnd = manage.indexOf("  useEffect(() =>", refreshStart + 1);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  const refreshSource = manage.slice(refreshStart, refreshEnd);
  assert.match(
    refreshSource,
    /if \(isPreview \|\| syncInFlightRef\.current\) return;[\s\S]*?const generation = \+\+syncGenerationRef\.current;[\s\S]*?const refreshed = announce \|\| !snapshot[\s\S]*?\? await managementAdapter\.load\(context\)[\s\S]*?: await managementAdapter\.refreshOperations\(context, snapshot\)[\s\S]*?generation !== syncGenerationRef\.current[\s\S]*?setSnapshot\(refreshed\)[\s\S]*?finally[\s\S]*?syncInFlightRef\.current = false/,
  );

  const operationalGuard = manage.indexOf(
    '(view !== "overview" && view !== "bookings")',
  );
  const autoRefreshStart = manage.lastIndexOf("useEffect(() =>", operationalGuard);
  const autoRefreshEnd = manage.indexOf("  useEffect(() =>", operationalGuard + 1);
  assert.ok(
    operationalGuard >= 0 &&
      autoRefreshStart >= 0 &&
      autoRefreshEnd > operationalGuard,
  );
  const autoRefresh = manage.slice(autoRefreshStart, autoRefreshEnd);
  assert.match(
    autoRefresh,
    /isPreview \|\| !snapshot \|\| authRequired \|\| confirmAction \|\| confirmPending \|\| refreshPending \|\|[\s\S]*?\(view !== "overview" && view !== "bookings"\)/,
  );
  assert.match(
    autoRefresh,
    /document\.visibilityState === "visible"[\s\S]*?refreshWorkspace\(false\)/,
  );
  assert.match(autoRefresh, /window\.setInterval\(refreshIfVisible, 20_000\)/);
  assert.match(
    autoRefresh,
    /window\.addEventListener\("focus", refreshIfVisible\)[\s\S]*?document\.addEventListener\("visibilitychange", refreshIfVisible\)[\s\S]*?window\.clearInterval\(interval\)[\s\S]*?window\.removeEventListener\("focus", refreshIfVisible\)[\s\S]*?document\.removeEventListener\("visibilitychange", refreshIfVisible\)/,
  );
  assert.match(
    autoRefresh,
    /\[authRequired, confirmAction, confirmPending, isPreview, refreshPending, refreshWorkspace, snapshot, view\]/,
  );
  assert.doesNotMatch(autoRefresh, /settings/);
  assert.match(
    manage,
    /\{!isPreview && \([\s\S]*?className=\{styles\.rallyTopIcon\}[\s\S]*?aria-label="Refresh live tenant data"[\s\S]*?disabled=\{syncPending\}[\s\S]*?onClick=\{\(\) => void refreshWorkspace\(true\)\}/,
  );
  assert.match(
    manage,
    /const request = \(action: ConfirmAction\) => \{[\s\S]*?syncGenerationRef\.current \+= 1;[\s\S]*?setConfirmAction\(action\);[\s\S]*?\};/,
  );

  const confirmedActionStart = manage.indexOf(
    "const performConfirmedAction = async () =>",
  );
  const confirmedActionEnd = manage.indexOf(
    "const selectedCopy =",
    confirmedActionStart,
  );
  assert.ok(
    confirmedActionStart >= 0 && confirmedActionEnd > confirmedActionStart,
  );
  const confirmedAction = manage.slice(
    confirmedActionStart,
    confirmedActionEnd,
  );
  assert.match(
    confirmedAction,
    /if \(!confirmAction\) return;[\s\S]*?const action = confirmAction;[\s\S]*?syncGenerationRef\.current \+= 1;[\s\S]*?managementAdapter\.perform\(context/,
  );
  const closeThenSuccess = confirmedAction.match(
    /dialogRef\.current\?\.close\(\);\s*setConfirmAction\(null\);\s*window\.requestAnimationFrame\(\(\) => action\.onSuccess\?\.\(result\)\);/g,
  ) ?? [];
  assert.equal(
    closeThenSuccess.length,
    2,
    "expected both successful completion paths to close the modal before delayed UI cleanup",
  );
  assert.equal(
    (confirmedAction.match(/action\.onSuccess\?\.\(result\)/g) ?? []).length,
    closeThenSuccess.length,
    "expected every post-write onSuccess callback to be delayed until after modal dismissal",
  );

  const paymentInboxCssStart = manageCss.indexOf(".paymentInbox {");
  assert.ok(paymentInboxCssStart >= 0);
  assert.match(
    cssBlock(manageCss.slice(paymentInboxCssStart), ".paymentInbox"),
    /overflow:\s*hidden[\s\S]*?border-radius:\s*var\(--admin-radius\)[\s\S]*?background:[\s\S]*?var\(--ink\)/,
  );
  assert.match(
    cssBlock(manageCss, ".paymentInboxItem"),
    /grid-template-columns:\s*minmax\(190px, \.7fr\) minmax\(360px, 1\.5fr\) auto/,
  );
  assert.match(
    cssBlock(manageCss.slice(manageCss.indexOf(".paymentInboxCounts {")), ".paymentInboxCounts"),
    /grid-template-columns:\s*repeat\(4, minmax\(72px, 1fr\)\)/,
  );
  assert.match(
    manageCss,
    /\.paymentReviewHeader :is\(h2, h3\):focus-visible,\s*\.paymentInboxHeader h2:focus-visible,\s*\.panelHeading h2:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--citrus\)[^}]*outline-offset:\s*2px[^}]*box-shadow:/s,
  );
  const compactCssStart = manageCss.indexOf(
    "@media (max-width: 680px)",
    paymentInboxCssStart,
  );
  const compactCss = cssBlock(
    manageCss.slice(compactCssStart),
    "@media (max-width: 680px)",
  );
  assert.match(
    compactCss,
    /\.paymentInboxHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    compactCss,
    /\.paymentInboxCounts\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
  );
  assert.match(
    compactCss,
    /\.paymentInboxItem\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    compactCss,
    /\.paymentInboxFacts\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
  );
  assert.doesNotMatch(
    compactCss,
    /\.paymentInboxFooter\b/,
  );
  const phoneCssStart = manageCss.indexOf("@media (max-width: 430px)", compactCssStart);
  const phoneCss = cssBlock(
    manageCss.slice(phoneCssStart),
    "@media (max-width: 430px)",
  );
  assert.match(
    phoneCss,
    /\.paymentInboxFacts\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    phoneCss,
    /\.paymentInboxAction\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(phoneCss, /\.paymentInboxAction \.button\s*\{[^}]*width:\s*100%/s);

  assert.match(
    cssBlock(manageCss, ".bookingRegisterPanel"),
    /min-width:\s*0;[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    manageCss,
    /\.bookingRecord\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(210px,\s*1\.15fr\)/,
  );
  assert.match(
    cssBlock(manageCss, ".bookingFilterRail"),
    /max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;[\s\S]*?overscroll-behavior-inline:\s*contain/,
  );
  const tabletShellCssStart = manageCss.indexOf(
    "@media (max-width: 900px)",
    paymentInboxCssStart,
  );
  const tabletShellCss = cssBlock(
    manageCss.slice(tabletShellCssStart),
    "@media (max-width: 900px)",
  );
  assert.match(tabletShellCss, /\.manageShell\s*\{[^}]*display:\s*block/s);
  assert.match(tabletShellCss, /\.main\s*\{[^}]*padding:\s*16px 18px 20px/s);
  const bookingCompactCss = compactCss;
  assert.match(
    bookingCompactCss,
    /\.bookingRecord\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*grid-template-areas:\s*"identity"\s*"session"\s*"payment"\s*"status"\s*"footer"/s,
  );
  assert.match(
    bookingCompactCss,
    /\.bookingRecordFooter\s*\{[^}]*align-items:\s*stretch;[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    bookingCompactCss,
    /\.bookingRecordActions > \*\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 108px/s,
  );
  assert.match(
    phoneCss,
    /\.bookingRegisterPanel \.panelHeading \.button\s*\{[^}]*width:\s*100%/s,
  );
  assert.match(phoneCss, /\.bookingRecord\s*\{[^}]*padding:\s*13px/s);
  assert.match(
    manageCss,
    /\.bookingRecordActions \.reviewPaymentButton\s*\{[^}]*min-height:\s*34px[\s\S]*?\.bookingRecordActions \.miniButton,\s*\.bookingRecordActions \.moreButton\s*\{[^}]*min-height:\s*34px/s,
  );
  assert.ok(
    manageCss.includes("@media (max-width: 390px)"),
    "expected the phone cascade to include a 390px refinement",
  );
});

test("loads an exact accessible calendar day and separates bookings, payment holds, and court blocks", async () => {
  const [calendar, calendarCss, manage, managementAdapter] = await Promise.all([
    readFile(files.calendarView, "utf8"),
    readFile(files.calendarCss, "utf8"),
    readFile(files.manage, "utf8"),
    readFile(files.managementAdapter, "utf8"),
  ]);

  assert.match(
    manage,
    /\{ id: "schedule", label: "Schedule", short: "CA" \}/,
  );
  assert.match(
    manage,
    /case "schedule": return snapshot\.tenant\.mode === "live" \? \([\s\S]*?<CalendarView[\s\S]*?initialBookings=\{snapshot\.bookings\}[\s\S]*?initialBlocks=\{snapshot\.blocks\}[\s\S]*?loadDay=\{loadCalendarDay\}[\s\S]*?timezone=\{snapshot\.tenant\.timezone\}[\s\S]*?currency=\{snapshot\.tenant\.currency\}/,
  );

  const dayLoaderStart = managementAdapter.indexOf(
    "async loadCalendarDay(context, current, date)",
  );
  const dayLoaderEnd = managementAdapter.indexOf(
    "async loadInsights(context, filters)",
    dayLoaderStart,
  );
  assert.ok(dayLoaderStart >= 0 && dayLoaderEnd > dayLoaderStart);
  const dayLoader = managementAdapter.slice(dayLoaderStart, dayLoaderEnd);
  assert.match(dayLoader, /if \(!DATE_PATTERN\.test\(date\)\)[\s\S]*?CALENDAR_DATE_INVALID/);
  assert.match(
    dayLoader,
    /current\.tenant\.mode !== "live"[\s\S]*?current\.tenant\.slug !== activeTenant\.identity\.slug[\s\S]*?LIVE_TENANT_SCOPE_MISMATCH/,
  );
  assert.match(
    dayLoader,
    /currentOwnerSession\(\)[\s\S]*?Promise\.all\(\[[\s\S]*?getManagerSession\(session\.access_token\)[\s\S]*?listManagerBookings\(session\.access_token, \{ activeOnly: true, limit: 500 \}\)[\s\S]*?listManagerBlocks\(session\.access_token, \{ date, limit: 500 \}\)/,
  );
  assert.match(
    dayLoader,
    /booking\.sessions\?\.some\(\(session\) => session\.bookingDate === date\)[\s\S]*?booking\.bookingDate === date/,
  );
  assert.match(
    dayLoader,
    /if \(!authorityCapabilities\(serverSession\)\.length\)[\s\S]*?CALENDAR_VIEW_ACCESS_DENIED[\s\S]*?bookingResult\.bookings[\s\S]*?\.map[\s\S]*?blockResult\.blockedDates\.map/,
  );

  assert.match(
    calendar,
    /export type CalendarViewProps = \{[\s\S]*?initialBookings: Booking\[\];[\s\S]*?initialBlocks: CourtBlock\[\];[\s\S]*?loadDay: \(date: string\) => Promise<CalendarDayData>;/,
  );
  const rowsStart = calendar.indexOf("function rowsForDate(");
  const rowsEnd = calendar.indexOf("function bookingEntry(", rowsStart);
  assert.ok(rowsStart >= 0 && rowsEnd > rowsStart);
  const rowsSource = calendar.slice(rowsStart, rowsEnd);
  assert.match(
    rowsSource,
    /booking\.bookingDate === date &&[\s\S]*?!TERMINAL_HIDDEN_STATUSES\.has\(booking\.status\)/,
  );
  assert.match(rowsSource, /blocks\.filter\(\(block\) => block\.dateValue === date\)/);

  const loaderStart = calendar.indexOf("useEffect(() => {", calendar.indexOf("const requestSequence"));
  const loaderEnd = calendar.indexOf("const effectiveCourtFilter", loaderStart);
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart);
  const loaderSource = calendar.slice(loaderStart, loaderEnd);
  assert.match(
    loaderSource,
    /const requestId = \+\+requestSequence\.current;[\s\S]*?loadDayRef\.current\(selectedDate\)[\s\S]*?requestSequence\.current !== requestId[\s\S]*?setDayData\(rowsForDate\(selectedDate, result\.bookings, result\.blocks\)\)/,
  );
  assert.match(
    loaderSource,
    /setPhase\("error"\)[\s\S]*?return \(\) => \{[\s\S]*?active = false;[\s\S]*?\[refreshKey, selectedDate\]/,
  );

  assert.match(
    calendar,
    /const TERMINAL_HIDDEN_STATUSES = new Set<Booking\["status"\]>\(\[[\s\S]*?"cancelled"[\s\S]*?"expired"/,
  );
  assert.match(
    calendar,
    /const HOLD_STATUSES = new Set<Booking\["status"\]>\(\[[\s\S]*?"awaiting_receipt"[\s\S]*?"receipt_processing"[\s\S]*?"payment_review"[\s\S]*?"payment_attention"/,
  );
  assert.match(
    calendar,
    /const isHold = HOLD_STATUSES\.has\(booking\.status\);[\s\S]*?\{isHold \? "Hold" : "Booking"\}/,
  );
  assert.match(
    calendar,
    /<span className=\{styles\.kindLabel\}>Block<\/span>[\s\S]*?Private note: \{block\.internalReason\}/,
  );
  assert.match(
    calendar,
    /<section className=\{styles\.scheduleSummary\} aria-label="Schedule totals">[\s\S]*?\{bookingCount\} confirmed booking[\s\S]*?Paid booking value[\s\S]*?Open inventory[\s\S]*?blockedCourtHours/,
  );
  assert.match(
    calendar,
    /const allCourtBlocks = blocks\.filter\(isAllCourtBlock\)[\s\S]*?\.\.\.allCourtBlocks\.map\(blockEntry\)[\s\S]*?isAllCourtBlock\(entry\.block\)[\s\S]*?`All courts · \$\{entry\.block\.publicLabel\}`/,
  );
  assert.doesNotMatch(calendar, /\bCheck[ -]?in\b/i);

  assert.match(
    calendar,
    /<section className=\{styles\.calendar\} aria-labelledby="calendar-view-title" aria-busy=\{phase === "loading"\}>/,
  );
  assert.match(calendar, /<header className=\{styles\.calendarHeader\}>[\s\S]*?className=\{styles\.dateControl\}[\s\S]*?className=\{styles\.toolbarActions\}/);
  assert.match(calendar, /aria-label="Previous day"[\s\S]*?aria-label="Next day"/);
  assert.match(
    calendar,
    /<input[\s\S]*?type="date"[\s\S]*?value=\{selectedDate\}[\s\S]*?DATE_PATTERN\.test\(event\.target\.value\)/,
  );
  assert.match(calendar, /role="status" aria-live="polite"/);
  assert.match(calendar, /className=\{styles\.srOnly\} aria-live="polite"/);
  assert.match(calendar, /className=\{styles\.errorState\} role="alert"/);
  assert.match(calendar, /reservation\.sessions\.length[\s\S]*?court-hours/);
  assert.match(calendar, /className=\{styles\.reservationSessions\}[\s\S]*?session\.court[\s\S]*?session\.time/);
  assert.match(
    calendar,
    /Status: \{STATUS_LABEL\[booking\.status\]\}[\s\S]*?Payment: \{PAYMENT_LABEL\[booking\.payment\]\}/,
  );

  assert.match(
    cssBlock(calendarCss, ".calendar"),
    /width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    calendarCss,
    /\.calendar button,\s*\.calendar input,\s*\.calendar select\s*\{[^}]*min-height:\s*40px/s,
  );
  assert.match(
    calendarCss,
    /\.calendar button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--citrus/,
  );
  assert.match(
    cssBlock(calendarCss, ".courtBoard"),
    /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 360px\), 1fr\)\)/,
  );
  assert.match(
    cssBlock(calendarCss, ".agendaItem"),
    /grid-template-columns:\s*minmax\(108px, 0\.34fr\) minmax\(0, 1fr\);[\s\S]*?min-width:\s*0/,
  );

  const tabletCss = cssBlock(calendarCss, "@media (max-width: 768px)");
  assert.match(tabletCss, /\.toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s);
  assert.match(tabletCss, /\.summary\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(tabletCss, /\.courtBoard\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.doesNotMatch(tabletCss, /overflow-x:\s*auto/);

  const phoneCss = cssBlock(calendarCss, "@media (max-width: 520px)");
  assert.match(phoneCss, /\.toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(phoneCss, /\.agendaItem\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(phoneCss, /\.semanticRow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.doesNotMatch(phoneCss, /overflow-x:\s*auto/);

  const narrowCss = cssBlock(calendarCss, "@media (max-width: 360px)");
  assert.match(narrowCss, /\.courtHeader\s*\{[^}]*display:\s*grid/s);
  assert.match(narrowCss, /\.courtBoard\s*\{[^}]*padding:\s*8px/s);
  assert.doesNotMatch(calendarCss, /min-width:\s*[4-9]\d{2}px/);
});

test("keeps analytics and finance complete, server-authoritative, capability-gated, and mobile-first", async () => {
  const [analyticsFinance, analyticsCss, client, manage, managementAdapter] =
    await Promise.all([
      readFile(files.analyticsFinance, "utf8"),
      readFile(files.analyticsFinanceCss, "utf8"),
      readFile(files.client, "utf8"),
      readFile(files.manage, "utf8"),
      readFile(files.managementAdapter, "utf8"),
    ]);

  assert.match(
    client,
    /export async function getManagerRegularBookingReport\([\s\S]*?"get_manager_regular_booking_report",[\s\S]*?p_tenant_slug: activeTenant\.identity\.slug,[\s\S]*?p_hostname: managementHostname\(\),[\s\S]*?p_date_from: input\.dateFrom,[\s\S]*?p_date_to: input\.dateTo,[\s\S]*?p_court_id: input\.courtId \|\| null/,
  );
  assert.match(
    client,
    /export async function getBookingFeeRemittanceDashboard\([\s\S]*?"get_booking_fee_remittance_dashboard",[\s\S]*?p_tenant_slug: activeTenant\.identity\.slug,[\s\S]*?p_hostname: managementHostname\(\)/,
  );
  assert.match(
    client,
    /export async function getBookingFeeRemittanceHistory\([\s\S]*?"get_booking_fee_remittance_history",[\s\S]*?p_limit: options\.limit \?\? 50,[\s\S]*?p_before: options\.before \|\| null/,
  );

  assert.match(
    managementAdapter,
    /export type ManagementCapability =[\s\S]*?\| "report:view"[\s\S]*?\| "finance:view"/,
  );
  assert.match(
    managementAdapter,
    /export type RegularBookingReport = \{[\s\S]*?allMatchingRowsAggregated: true;[\s\S]*?currentStateSnapshot: true;[\s\S]*?fullPaymentEventLedgerIncluded: false;[\s\S]*?fullRefundEventLedgerIncluded: false;[\s\S]*?netRevenueIncluded: false;[\s\S]*?remittanceDueIncluded: false;[\s\S]*?remittanceContract: "get_booking_fee_remittance_dashboard";/,
  );

  const insightGuardStart = managementAdapter.indexOf(
    "function assertInsightsViewer(",
  );
  const insightGuardEnd = managementAdapter.indexOf(
    "function assertBookingManager(",
    insightGuardStart,
  );
  assert.ok(insightGuardStart >= 0 && insightGuardEnd > insightGuardStart);
  assert.match(
    managementAdapter.slice(insightGuardStart, insightGuardEnd),
    /!session\.isSystemOwner && session\.membershipRole !== "owner" &&[\s\S]*?session\.membershipRole !== "admin"[\s\S]*?FINANCE_VIEW_ACCESS_DENIED/,
  );

  const insightLoaderStart = managementAdapter.indexOf(
    "async loadInsights(context, filters)",
  );
  const insightLoaderEnd = managementAdapter.indexOf(
    "async refreshOperations(context, current)",
    insightLoaderStart,
  );
  assert.ok(insightLoaderStart >= 0 && insightLoaderEnd > insightLoaderStart);
  const insightLoader = managementAdapter.slice(insightLoaderStart, insightLoaderEnd);
  assert.match(
    insightLoader,
    /platformMode\(\) === "preview"[\s\S]*?mode: "preview",[\s\S]*?report: null,[\s\S]*?finance: null/,
  );
  assert.match(
    insightLoader,
    /assertActiveTenantContext\(context\)[\s\S]*?const normalizedFilters = insightFilters\(filters\)[\s\S]*?currentOwnerSession\(\)[\s\S]*?getManagerSession\(session\.access_token\)[\s\S]*?assertInsightsViewer\(authority\)/,
  );
  assert.match(
    insightLoader,
    /Promise\.all\(\[[\s\S]*?getManagerRegularBookingReport\(session\.access_token, normalizedFilters\)[\s\S]*?getBookingFeeRemittanceDashboard\(session\.access_token\)[\s\S]*?getBookingFeeRemittanceHistory\(session\.access_token, \{ limit: 50 \}\)[\s\S]*?report: regularBookingReport\(reportResult, normalizedFilters\)[\s\S]*?dashboard: remittanceDashboard\(remittanceResult\)[\s\S]*?history: remittanceHistory\(historyResult\)/,
  );

  const reportParserStart = managementAdapter.indexOf(
    "function assertReportHasNoPii(",
  );
  const reportParserEnd = managementAdapter.indexOf(
    "const REMITTANCE_STATUSES",
    reportParserStart,
  );
  assert.ok(reportParserStart >= 0 && reportParserEnd > reportParserStart);
  const reportParser = managementAdapter.slice(reportParserStart, reportParserEnd);
  assert.match(
    reportParser,
    /customername[\s\S]*?customeremail[\s\S]*?customerphone[\s\S]*?bookingreference[\s\S]*?paymentreference[\s\S]*?receipturl[\s\S]*?REGULAR_BOOKING_REPORT_PII_REJECTED/,
  );
  assert.match(
    reportParser,
    /allMatchingRowsAggregated !== true[\s\S]*?currentStateSnapshot !== true[\s\S]*?fullPaymentEventLedgerIncluded !== false[\s\S]*?fullRefundEventLedgerIncluded !== false/,
  );
  assert.match(
    reportParser,
    /boundaryRow\.netRevenueIncluded !== false[\s\S]*?boundaryRow\.remittanceDueIncluded !== false[\s\S]*?boundaryRow\.remittanceContract !== "get_booking_fee_remittance_dashboard"/,
  );
  assert.match(
    reportParser,
    /daily\.length !== dayCount[\s\S]*?sameAggregate\([\s\S]*?daily\.reduce[\s\S]*?summary\.grossPaid[\s\S]*?courts\.reduce[\s\S]*?paymentStatuses\.reduce[\s\S]*?lifecycleStatuses\.reduce/,
  );

  const remittanceParserStart = managementAdapter.indexOf(
    "const REMITTANCE_STATUSES",
  );
  const remittanceParserEnd = managementAdapter.indexOf(
    "function record(candidate",
    remittanceParserStart,
  );
  assert.ok(remittanceParserStart >= 0 && remittanceParserEnd > remittanceParserStart);
  const remittanceParser = managementAdapter.slice(
    remittanceParserStart,
    remittanceParserEnd,
  );
  assert.match(
    remittanceParser,
    /"draft"[\s\S]*?"due"[\s\S]*?"submitted"[\s\S]*?"under_review"[\s\S]*?"settled"[\s\S]*?"rejected"[\s\S]*?"void"/,
  );
  assert.match(
    remittanceParser,
    /amountSettled > amountDue \+ 0\.01[\s\S]*?sameAggregate\(Math\.max\(amountDue - amountSettled, 0\), remainingBalance\)/,
  );
  assert.match(
    remittanceParser,
    /accumulated:[\s\S]*?amountDue: reportNumber\(accumulatedRow\.amount_due[\s\S]*?openRemittances: reportArray\(row\.open_remittances[\s\S]*?settledTotal: reportNumber\(row\.settled_total/,
  );

  assert.match(
    manage,
    /\{ id: "finance", label: "Money", short: "FN" \}[\s\S]*?\{ id: "reports", label: "Insights", short: "AN" \}/,
  );
  assert.match(
    manage,
    /reports: "report:view",[\s\S]*?finance: "finance:view"/,
  );
  assert.match(
    manage,
    /const \[analyticsPeriod, setAnalyticsPeriod\] = useState<AnalyticsPeriod>\("7d"\)[\s\S]*?const \[analyticsCourtId, setAnalyticsCourtId\] = useState<string \| null>\(null\)/,
  );
  assert.match(
    manage,
    /if \(!snapshot \|\| \(view !== "reports" && view !== "finance"\)\) return;[\s\S]*?const capability = view === "finance" \? "finance:view" : "report:view";[\s\S]*?managementAdapter\.loadInsights\(context, \{[\s\S]*?courtId: analyticsCourtId/,
  );
  assert.match(
    manage,
    /case "reports": return <AnalyticsView[\s\S]*?report=\{insights\?\.report \?\? null\}[\s\S]*?onPeriodChange=\{setAnalyticsPeriod\}[\s\S]*?onCourtChange=\{setAnalyticsCourtId\}[\s\S]*?case "finance": return <FinanceView[\s\S]*?finance=\{insights\?\.finance \?\? null\}/,
  );

  assert.match(
    analyticsFinance,
    /if \(loading && !report\) return <LoadingPanel label="analytics" \/>;[\s\S]*?No sample totals are shown\./,
  );
  assert.match(
    analyticsFinance,
    /const periodLabel = `\$\{localDate\(report\.range\.dateFrom\)\} . \$\{localDate\(report\.range\.dateTo\)\}`[\s\S]*?<section className=\{`\$\{styles\.workspace\} \$\{styles\.insightsView\}`\} aria-labelledby="analytics-title" aria-busy=\{loading\}>[\s\S]*?\{activeTenant\.identity\.shortName\} intelligence \/ \{periodLabel\}/,
  );
  assert.match(
    analyticsFinance,
    /aria-label="Owner performance summary"[\s\S]*?Gross bookings[\s\S]*?summary\.grossPaid[\s\S]*?Court utilization[\s\S]*?summary\.bookedHours[\s\S]*?Completed bookings[\s\S]*?summary\.lifecycleCounts\.completed[\s\S]*?Revenue \/ court-hour[\s\S]*?summary\.paidBookingCount/,
  );
  assert.match(
    analyticsFinance,
    /<svg[\s\S]*?role="img"[\s\S]*?aria-labelledby="daily-gross-chart-title daily-gross-chart-description"[\s\S]*?<title id="daily-gross-chart-title">Paid customer gross by booking date<\/title>[\s\S]*?<desc id="daily-gross-chart-description">\{description\}<\/desc>/,
  );
  assert.match(
    analyticsFinance,
    /This is not a payment-event or full refund ledger, so net revenue and occupancy are intentionally not estimated\. Remittance due comes from the separate platform-fee ledger\./,
  );

  const financeStart = analyticsFinance.indexOf("export function FinanceView(");
  assert.ok(financeStart >= 0);
  const financeView = analyticsFinance.slice(financeStart);
  assert.match(
    financeView,
    /if \(loading && !finance\) return <LoadingPanel label="finance" \/>;[\s\S]*?No sample balances are shown\./,
  );
  assert.match(
    financeView,
    /const \{ dashboard, history \} = finance;[\s\S]*?dashboard\.openRemittances\.reduce[\s\S]*?dashboard\.accumulated\.amountDue[\s\S]*?dashboard\.settledTotal[\s\S]*?dashboard\.nextDueOn/,
  );
  assert.match(
    financeView,
    /dashboard\.role === "system_owner"[\s\S]*?Monitor access[\s\S]*?System Owner access is read-only here\. The venue owner prepares and submits remittance/,
  );
  assert.match(
    financeView,
    /dashboard\.openRemittances\.map\(\(item\) => <RemittanceCard[\s\S]*?history\.map\(\(item\) =>/,
  );
  assert.match(
    financeView,
    /Open and settled values come from remittance records and accepted payments—not from the analytics chart or a browser-side fee estimate\./,
  );
  assert.doesNotMatch(financeView, /snapshot\.bookings|platformBilling|feeMode|feeAmount/);

  assert.match(
    cssBlock(analyticsCss, ".workspace"),
    /display:\s*grid;[\s\S]*?min-width:\s*0/,
  );
  assert.match(
    cssBlock(analyticsCss, ".kpiGrid"),
    /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    analyticsCss,
    /\.segmentedControl button\s*\{[^}]*min-width:\s*76px;[^}]*min-height:\s*44px/s,
  );
  const tabletAnalyticsCss = cssBlock(analyticsCss, "@media (max-width: 768px)");
  assert.match(
    tabletAnalyticsCss,
    /\.sectionHeader,[\s\S]*?\.controlRow\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    tabletAnalyticsCss,
    /\.financeGrid,[\s\S]*?\.remittanceGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  const phoneAnalyticsCss = cssBlock(analyticsCss, "@media (max-width: 480px)");
  assert.match(
    phoneAnalyticsCss,
    /\.kpiGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    phoneAnalyticsCss,
    /\.historyList li\s*\{[^}]*flex-direction:\s*column/s,
  );
  const narrowAnalyticsCss = cssBlock(analyticsCss, "@media (max-width: 340px)");
  assert.match(
    narrowAnalyticsCss,
    /\.segmentedControl\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
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
    /\b(?:slug|sortOrder)\s*:/,
  );
  assert.match(
    newCourtDraftSource,
    /name:\s*string;[\s\S]*?description:\s*string;[\s\S]*?status:\s*CourtDraft\["status"\];[\s\S]*?opensAt:\s*string;[\s\S]*?peakStartsAt:\s*string;[\s\S]*?closesAt:\s*string;[\s\S]*?dayRate:\s*string;[\s\S]*?peakRate:\s*string;/,
  );

  const hourOptionsStart = manage.indexOf("const wholeHourOptions:");
  const hourOptionsEnd = manage.indexOf(
    "function newCourtDraftFor(",
    hourOptionsStart,
  );
  assert.ok(hourOptionsStart >= 0 && hourOptionsEnd > hourOptionsStart);
  const hourOptionsSource = manage.slice(hourOptionsStart, hourOptionsEnd);
  assert.match(hourOptionsSource, /ClockOption\[\]\s*=\s*Array\.from\(\{ length: 24 \}/);
  assert.match(hourOptionsSource, /value:\s*clockValueForHour\(hour\)!/);
  assert.match(hourOptionsSource, /label:\s*formatClockLabel\(hour\)/);
  assert.match(manage, /closeOptionsFor\(newCourt\.opensAt\)\.map/);
  assert.match(
    manage,
    /boundaryOptionsFor\(newCourt\.opensAt, newCourt\.closesAt\)\.map/,
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
  assert.match(sortSource, /Number\.isSafeInteger\(court\.sortOrder\)/);
  assert.match(sortSource, /Math\.max\(current, Math\.min\(court\.sortOrder, 10_000\)\)/);
  assert.match(sortSource, /return Math\.min\(highest \+ 1, 10_000\)/);

  const courtsSectionStart = manage.indexOf('{section === "courts" &&');
  const courtsHeadingStart = manage.indexOf(
    '<div className={cx(styles.panelHeading, styles.courtPanelHeading)}>',
    courtsSectionStart,
  );
  const courtsIntroStart = manage.indexOf(
    '<p className={styles.sectionIntro}>',
    courtsHeadingStart,
  );
  assert.ok(
    courtsSectionStart >= 0 &&
      courtsHeadingStart > courtsSectionStart &&
      courtsIntroStart > courtsHeadingStart,
  );
  const courtsHeadingSource = manage.slice(courtsHeadingStart, courtsIntroStart);
  assert.match(courtsHeadingSource, /<h2>Courts<\/h2>/);
  assert.match(
    courtsHeadingSource,
    /<div className=\{styles\.courtHeadingActions\}>[\s\S]*?<span className=\{styles\.previewTag\}>Server records<\/span>[\s\S]*?<button[\s\S]*?ref=\{addCourtButtonRef\}[\s\S]*?disabled=\{!can\("settings:update"\) \|\| addingCourt\}[\s\S]*?aria-expanded=\{addingCourt\}[\s\S]*?aria-controls="new-court-form"[\s\S]*?onClick=\{openNewCourtForm\}\s*>[\s\S]*? Add court[\s\S]*?<\/button>/,
  );
  assert.equal(
    (manage.match(/onClick=\{openNewCourtForm\}/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(manage, /styles\.addCourtRow/);
  assert.doesNotMatch(manage, /Need another court\?|styles\.newCourtDetails/);
  assert.doesNotMatch(
    manage,
    /newCourtDialogRef|openNewCourtDialog|closeNewCourtDialog|styles\.courtDialog/,
  );

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

  const openFormStart = manage.indexOf("const openNewCourtForm = () => {");
  const cancelFormStart = manage.indexOf(
    "const cancelNewCourtForm = () => {",
    openFormStart,
  );
  const focusEffectStart = manage.indexOf("useEffect(() => {", cancelFormStart);
  assert.ok(
    openFormStart >= 0 &&
      cancelFormStart > openFormStart &&
      focusEffectStart > cancelFormStart,
  );
  const openFormSource = manage.slice(openFormStart, cancelFormStart);
  const cancelFormSource = manage.slice(cancelFormStart, focusEffectStart);
  assert.match(
    manage,
    /const \[addingCourt, setAddingCourt\] = useState\(false\)/,
  );
  assert.match(
    openFormSource,
    /setNewCourt\(newCourtDraftFor\(snapshot\)\)[\s\S]*?setNewCourtAttempted\(false\)[\s\S]*?setAddingCourt\(true\)/,
  );
  assert.match(
    cancelFormSource,
    /setNewCourt\(newCourtDraftFor\(snapshot\)\)[\s\S]*?setNewCourtAttempted\(false\)[\s\S]*?setAddingCourt\(false\)[\s\S]*?requestAnimationFrame[\s\S]*?addCourtButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(
    manage.slice(focusEffectStart, manage.indexOf("const setBusinessField", focusEffectStart)),
    /if \(addingCourt\) newCourtNameRef\.current\?\.focus\(\)/,
  );
  assert.doesNotMatch(openFormSource, /showModal|\.close\(|<dialog/);

  const courtsSectionEnd = manage.indexOf(
    '{section === "schedule" &&',
    courtsIntroStart,
  );
  const addBranchStart = manage.indexOf("{addingCourt ? (", courtsIntroStart);
  const formId = manage.indexOf('id="new-court-form"', addBranchStart);
  const inlineFormStart = manage.lastIndexOf("<form", formId);
  const inlineFormEnd = manage.indexOf("</form>", formId);
  const listBranchStart = manage.indexOf(") : (", inlineFormEnd);
  const courtListStart = manage.indexOf(
    '<div className={styles.courtSettingList}>',
    listBranchStart,
  );
  assert.ok(
    courtsSectionEnd > courtsIntroStart &&
      addBranchStart > courtsIntroStart &&
      inlineFormStart > addBranchStart &&
      inlineFormEnd > inlineFormStart &&
      listBranchStart > inlineFormEnd &&
      courtListStart > listBranchStart &&
      courtListStart < courtsSectionEnd,
  );
  const courtsSectionSource = manage.slice(courtsSectionStart, courtsSectionEnd);
  const controlsSource = manage.slice(inlineFormStart, inlineFormEnd);
  assert.match(
    controlsSource,
    /<form[\s\S]*?id="new-court-form"[\s\S]*?className=\{styles\.newCourtInlineForm\}[\s\S]*?aria-labelledby="add-court-title"[\s\S]*?aria-describedby="add-court-description"/,
  );
  assert.match(controlsSource, /<h3 id="add-court-title">Court details<\/h3>/);
  assert.match(controlsSource, /<p id="add-court-description">/);
  assert.doesNotMatch(courtsSectionSource, /<dialog\b|showModal\(|onCancel=/);
  assert.doesNotMatch(controlsSource, /<article\b|styles\.courtEditorCard/);
  const controlledFields = [
    ...controlsSource.matchAll(/setNewCourtField\("([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(controlledFields, [
    "name",
    "status",
    "description",
    "peakStartsAt",
    "dayRate",
    "peakRate",
    "minimumHours",
    "maximumHours",
    "minimumLeadMinutes",
    "maximumAdvanceDays",
  ]);
  assert.match(controlsSource, /onChange=\{\(event\) => setNewCourtOpen\(event\.target\.value\)\}/);
  assert.match(controlsSource, /onChange=\{\(event\) => setNewCourtClose\(event\.target\.value\)\}/);
  assert.match(controlsSource, /<span>Court name<\/span><input\b[^>]*\brequired\b/);
  assert.match(
    controlsSource,
    /<span>Description <small>Optional<\/small><\/span><textarea\b(?![^>]*\brequired\b)/,
  );
  assert.match(controlsSource, /<span>Initial status<\/span><select\b[^>]*\brequired\b/);
  assert.match(
    controlsSource,
    /<span>Opens<\/span><select\b[^>]*value=\{newCourt\.opensAt\}[\s\S]*?key=\{`open-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    controlsSource,
    /<span>Peak starts<\/span><select\b[^>]*value=\{newCourt\.peakStartsAt\}[\s\S]*?boundaryOptionsFor\(newCourt\.opensAt, newCourt\.closesAt\)[\s\S]*?key=\{`peak-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    controlsSource,
    /<span>Closes<\/span><select\b[^>]*value=\{newCourt\.closesAt\}[\s\S]*?closeOptionsFor\(newCourt\.opensAt\)[\s\S]*?key=\{`close-\$\{option\.value\}`\}[\s\S]*?>\{option\.label\}/,
  );
  assert.match(
    controlsSource,
    /className=\{styles\.operatingSummary\}[\s\S]*?operatingWindowSummary\(newCourt\.opensAt, newCourt\.closesAt, newCourt\.peakStartsAt\)/,
  );
  assert.match(controlsSource, /<span>Day rate \/ hour<\/span>/);
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

  const requestStart = controlsSource.indexOf("request({");
  const createEnd = controlsSource.indexOf("onSuccess:", requestStart);
  assert.ok(requestStart >= 0 && createEnd > requestStart);
  const beforeRequestSource = controlsSource.slice(0, requestStart);
  const createSource = controlsSource.slice(requestStart, createEnd);
  assert.doesNotMatch(beforeRequestSource, /setAddingCourt\(false\)|cancelNewCourtForm\(/);
  assert.match(createSource, /generatedCourtSlug\(newCourt\.name, snapshot\)/);
  assert.match(createSource, /nextCourtSortOrder\(snapshot\)/);
  assert.match(createSource, /slug:\s*generatedCourtSlug\(newCourt\.name, snapshot\)/);
  assert.match(createSource, /sortOrder:\s*nextCourtSortOrder\(snapshot\)/);
  assert.match(createSource, /minimumHours:\s*Number\(newCourt\.minimumHours\)/);
  assert.match(createSource, /maximumHours:\s*Number\(newCourt\.maximumHours\)/);
  assert.match(createSource, /bands:\s*courtSchedule\.bands/);
  assert.match(createSource, /minimumLeadMinutes:\s*Number\(newCourt\.minimumLeadMinutes\)/);
  assert.match(createSource, /maximumAdvanceDays:\s*Number\(newCourt\.maximumAdvanceDays\)/);
  assert.match(controlsSource, /onSuccess:\s*cancelNewCourtForm/);
  assert.match(
    controlsSource,
    /<ActionButton variant="quiet" onClick=\{cancelNewCourtForm\}>Cancel<\/ActionButton>/,
  );

  assert.doesNotMatch(manage, /NEW_COURT_INTERNAL_DEFAULTS/);
  assert.match(
    manage,
    /const minimumHours = Number\(draft\.minimumHours\)[\s\S]*?minimumHours < 1 \|\| minimumHours > 18[\s\S]*?maximumHours < minimumHours \|\| maximumHours > 18[\s\S]*?Booking duration must be 1 to 18 hours/,
  );

  const scheduleStart = courtsSectionEnd;
  const businessStart = manage.indexOf('{section === "business" &&', scheduleStart);
  assert.ok(scheduleStart >= 0 && businessStart > scheduleStart);
  const scheduleSource = manage.slice(scheduleStart, businessStart);
  assert.equal((scheduleSource.match(/wholeHourOptions\.map/g) ?? []).length, 1);
  assert.equal((scheduleSource.match(/closeOptionsFor\(scheduleDraft\.opensAt\)\.map/g) ?? []).length, 1);
  assert.equal((scheduleSource.match(/boundaryOptionsFor\(scheduleDraft\.opensAt, scheduleDraft\.closesAt\)\.map/g) ?? []).length, 1);
  assert.match(
    scheduleSource,
    /<span>Opens<\/span><select\b[^>]*value=\{scheduleDraft\.opensAt\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    scheduleSource,
    /<span>Rate boundary<\/span><select\b[^>]*value=\{scheduleDraft\.boundaryAt\}[\s\S]*?>\{option\.label\}<\/option>/,
  );
  assert.match(
    scheduleSource,
    /<span>Closes<\/span><select\b[^>]*value=\{scheduleDraft\.closesAt\}[\s\S]*?>\{option\.label\}/,
  );
  assert.match(manage, /actionType:\s*"settings:schedule",[\s\S]*?payload:\s*schedulePayload/);
  assert.doesNotMatch(scheduleSource, /type="time"/);

  assert.match(cssBlock(manageCss, ".button"), /min-height:\s*40px/);
  assert.match(
    cssBlock(manageCss, ".field input, .field select, .field textarea"),
    /min-height:\s*44px/,
  );
  assert.doesNotMatch(
    manageCss,
    /\.courtDialog\b|\.courtDialogShell\b|\.courtDialogHeader\b|\.courtDialogBody\b|\.courtDialogActions\b|\.newCourtForm\b/,
  );
  const inlineFormCss = cssBlock(manageCss, ".newCourtInlineForm");
  assert.match(inlineFormCss, /display:\s*grid/);
  assert.match(inlineFormCss, /border-block:\s*1px solid var\(--line\)/);
  assert.doesNotMatch(
    inlineFormCss,
    /\b(?:background|border-radius|box-shadow|max-height|overflow(?:-[xy])?)\s*:/,
  );
  const inlineScheduleCss = cssBlock(manageCss, ".newCourtSchedule");
  assert.match(inlineScheduleCss, /border:\s*0/);
  assert.doesNotMatch(
    inlineScheduleCss,
    /\b(?:background|border-radius|box-shadow|max-height|overflow(?:-[xy])?)\s*:/,
  );
  assert.match(
    cssBlock(manageCss, ".newCourtTimes"),
    /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    cssBlock(manageCss, ".newCourtRates"),
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.doesNotMatch(manageCss, /\.addCourtRow\b/);
  const headingActionsCss = cssBlock(manageCss, ".courtHeadingActions");
  assert.match(headingActionsCss, /display:\s*flex/);
  assert.match(headingActionsCss, /margin-left:\s*auto/);
  assert.doesNotMatch(
    headingActionsCss,
    /\b(?:background|border(?:-radius)?|padding)\s*:/,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.newCourtBasics\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
  assert.match(
    manageCss,
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.newCourtActions \.button\s*\{[^}]*min-width:\s*0[^}]*flex:\s*1/s,
  );
  const narrowCss = cssBlock(manageCss, "@media (max-width: 430px)");
  assert.match(
    narrowCss,
    /\.courtPanelHeading\s*\{[^}]*align-items:\s*center[^}]*flex-direction:\s*row[^}]*gap:\s*10px/s,
  );
  assert.match(
    narrowCss,
    /\.courtHeadingActions\s*\{[^}]*width:\s*auto[^}]*justify-content:\s*flex-end[^}]*margin-left:\s*auto/s,
  );
  assert.match(
    narrowCss,
    /\.courtHeadingActions \.previewTag\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    narrowCss,
    /\.newCourtInlineForm\s*\{[^}]*gap:\s*15px[^}]*padding-top:\s*15px/s,
  );
  assert.match(
    narrowCss,
    /\.newCourtTimes\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*gap:\s*8px/s,
  );
  assert.match(
    narrowCss,
    /\.newCourtTimes \.field:nth-child\(3\)\s*\{[^}]*grid-column:\s*1 \/ -1/s,
  );
  assert.match(narrowCss, /\.newCourtRates\s*\{[^}]*gap:\s*8px/s);

  const phoneCss = cssBlock(manageCss, "@media (max-width: 390px)");
  assert.match(
    phoneCss,
    /\.newCourtTimes\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    phoneCss,
    /\.newCourtTimes \.field:nth-child\(3\)\s*\{[^}]*grid-column:\s*auto/s,
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
  assert.match(
    client,
    /result\.tenant\?\.slug !== activeTenant\.identity\.slug[\s\S]*?"LIVE_TENANT_SCOPE_MISMATCH"/,
  );
  assert.doesNotMatch(client, /turnstile|TURNSTILE/i);
  assert.match(config, /status:\s*"active"/);
  assert.match(config, /publicBookingEnabled:\s*true/);
  assert.match(
    booking,
    /isLive &&[\s\S]*?!bootstrap\?\.readiness\.publicBookingEnabled/,
  );
  assert.doesNotMatch(
    booking,
    /activeTenant\.activation\.publicBookingEnabled/,
  );
  assert.match(booking, /if \(isLive && !paymentMethod\)/);
  assert.match(booking, /if \(isLive && !policyVersion\)/);
  assert.doesNotMatch(booking, /turnstile|securitySiteKey/i);
  assert.match(managementAdapter, /if \(!session\) throw new Error\("MANAGER_SIGN_IN_REQUIRED"\)/);
  assert.match(managementAdapter, /assertActiveTenantContext\(context\)/);
  assert.match(
    managementAdapter,
    /if \(context\.tenantSlug !== activeTenant\.identity\.slug\)[\s\S]*?throw new Error\("LIVE_TENANT_SCOPE_MISMATCH"\)/,
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

  assert.match(booking, /const activeHoldStorageKey = `\$\{tenantStoragePrefix\}:active-hold`/);
  assert.match(booking, /bookingStatus\(pointer\.reference, parsed\.token\)/);
  assert.match(booking, /holdExpired/);
  assert.match(booking, /holdRemainingSeconds/);
  assert.match(booking, /Reserve the slot before sending payment\./);
  assert.match(booking, /paymentAccountReady/);
  assert.match(booking, /bootstrap\?\.paymentMethods\.find\([\s\S]*?toLowerCase\(\) === "gcash"/);
  assert.match(booking, /paymentMethod\?\.accountNumber \?\? paymentMethod\?\.accountReference/);
  assert.doesNotMatch(booking, /Interactive payment demo|simulate an approved GCash payment/i);
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

  const reserveStart = booking.indexOf("async function createSelectionHold(");
  const reserveEnd = booking.indexOf("async function completeHeldBookingDetails(", reserveStart);
  assert.ok(reserveStart >= 0 && reserveEnd > reserveStart);
  const reserveSource = booking.slice(reserveStart, reserveEnd);
  const createHoldIndex = reserveSource.indexOf("adapter.createHold(");
  assert.ok(createHoldIndex >= 0, "expected Step 1 to create the hold before details");

  for (const [label, guard] of [
    ["bootstrap failure", /if \(bootstrapState === "error"\)/],
    ["public-booking readiness", /if \([\s\S]*?isLive &&[\s\S]*?!bootstrap\?\.readiness\.publicBookingEnabled/],
    ["payment readiness", /if \(isLive && !paymentMethod\)/],
    ["published policy", /if \(isLive && !policyVersion\)/],
    ["non-empty selection", /if \(!selectedSlots\.length\)/],
    ["fail-closed live selection", /if \(isLive && !liveSelectionSupported\)/],
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
    /const booking = await adapter\.createHold\(\{[\s\S]*?items: selectedSlots,[\s\S]*?customer,[\s\S]*?policyAccepted: true,[\s\S]*?policyVersion:[\s\S]*?detailsPending: true/,
  );
  assert.ok(
    reserveSource.indexOf("setPendingBooking(booking)") > createHoldIndex &&
      reserveSource.indexOf("setStep(2)") >
        reserveSource.indexOf("setPendingBooking(booking)"),
    "expected a successful hold to become the pending booking before opening details",
  );
  assert.doesNotMatch(reserveSource, /setStep\(4\)/);

  const detailsStart = booking.indexOf("async function completeHeldBookingDetails(");
  const detailsEnd = booking.indexOf("async function submitPayment(", detailsStart);
  const detailsSource = booking.slice(detailsStart, detailsEnd);
  assert.match(detailsSource, /if \(!validateDetails\(\)\) return;/);
  assert.match(detailsSource, /if \(!acceptedPolicy\)/);
  assert.match(detailsSource, /if \(!pendingBooking\)/);
  assert.match(detailsSource, /adapter\.completeDetails\(/);
  assert.match(detailsSource, /setStep\(3\)/);

  const adapterDetailsStart = booking.indexOf("async completeDetails(");
  const adapterDetailsEnd = booking.indexOf("async submitPayment(", adapterDetailsStart);
  assert.ok(adapterDetailsStart >= 0 && adapterDetailsEnd > adapterDetailsStart);
  const adapterDetailsSource = booking.slice(adapterDetailsStart, adapterDetailsEnd);
  assert.match(
    adapterDetailsSource,
    /error\.message !== "Player details have already been completed\."/,
  );
  assert.match(
    adapterDetailsSource,
    /bookingStatus\(parsed\.record\.reference, parsed\.token\)/,
  );
  assert.ok(
    adapterDetailsSource.indexOf("bookingStatus(parsed.record.reference, parsed.token)") <
      adapterDetailsSource.indexOf("detailsComplete: true"),
    "an already-completed response must be revalidated before payment resumes",
  );
  assert.match(adapterDetailsSource, /currentStatus !== "pending_payment"/);
  assert.match(adapterDetailsSource, /Date\.parse\(currentExpiry\) <= Date\.now\(\)/);

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
  assert.match(booking, /const bookingOwnsSelectionRef = useRef\(false\);/);
  const restoredSelectionOwnership = restoreSource.search(
    /bookingOwnsSelectionRef\.current = true/,
  );
  const restoredSelectionReplacement = restoreSource.search(
    /dispatchSelection\(\{\s*type: "replace"/,
  );
  const restoredStatusBranch = restoreSource.indexOf(
    'if (restored.status === "confirmed" || restored.status === "payment_review")',
  );
  assert.ok(
    restoredSelectionOwnership >= 0 &&
      restoredSelectionOwnership < restoredSelectionReplacement &&
      restoredSelectionReplacement < restoredStatusBranch,
    "expected every verified restored booking to own its selection before pending/confirmed status branches",
  );
  assert.match(
    restoreSource,
    /if \(restored\.status === "confirmed" \|\| restored\.status === "payment_review"\)[\s\S]*?setPendingBooking\(null\);[\s\S]*?setConfirmedBooking\(restored\);[\s\S]*?setStep\(4\);/,
  );
  assert.match(
    restoreSource,
    /setConfirmedBooking\(null\);[\s\S]*?setPendingBooking\(restored\);[\s\S]*?setStep\(restored\.detailsComplete === false \? 2 : 3\);/,
  );
  assert.match(
    booking,
    /if \(!bookingOwnsSelectionRef\.current\)\s*\{\s*dispatchSelection\(\{ type: "retain-open", openKeys \}\);\s*\}/,
  );
  assert.equal(
    (booking.match(/dispatchSelection\(\{ type: "retain-open", openKeys \}\)/g) ?? [])
      .length,
    1,
    "expected the sole availability-pruning dispatch to remain behind the booking ownership guard",
  );

  assert.doesNotMatch(booking, /turnstile|challenges\.cloudflare\.com/i);
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
  assert.match(documentText(customerHtml), /Checking availability/i);
  assert.match(customerHtml, /class="setup-unavailable-card"[^>]*role="status"/i);
  assert.match(booking, /aria-label="Booking actions"/i);
  assert.match(booking, /aria-label="Booking progress"/i);
  assert.match(booking, /aria-label="Availability legend"/i);
  assert.match(booking, /role="group" aria-label="Court gallery setup status"/i);
  assert.match(booking, /role="group" aria-label="Community channels setup status"/i);
  assert.doesNotMatch(booking, /booking-venue-hero[^>]*aria-label=/i);
  assert.match(booking, /<legend className="sr-only">Select a date<\/legend>/i);
  assert.match(booking, /role="radio"[^>]*aria-checked=\{selectedDate === date\.iso\}/i);

  assert.match(managerHtml, /aria-label="Management navigation"/i);
  assert.match(managerHtml, /aria-label="Mobile management navigation"/i);
  assert.match(managerHtml, /aria-current="page"/i);
  assert.match(documentText(managerHtml), /Current tenant K&L/i);
  assert.doesNotMatch(managerHtml, /aria-label="Preview search control"/i);
  assert.doesNotMatch(managerHtml, /aria-label="Preview notifications"/i);
  assert.match(manage, /isPreview && !setupPreview && <button[^>]*aria-label="Preview search control"/);
  assert.match(manage, /isPreview && !setupPreview && <button[^>]*aria-label="Preview notifications"/);
  assert.match(
    manage,
    /const setupPreview =\s*isPreview &&\s*activeTenant\.activation\.status === "setup_required"/s,
    "setup-required tenants must expose their real empty setup forms when the live platform is connected",
  );
  assert.match(managerHtml, /aria-label="Preview account control unavailable|Sign out and use another account"/i);
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
  assert.match(manage, /rescheduleReturnRef\.current = event\.currentTarget/);
  assert.match(manage, /customerReturnRef\.current = event\.currentTarget/);
  assert.ok(
    (manage.match(/event\.key !== "Tab"/g) ?? []).length >= 2,
    "expected focus containment in both custom management dialogs",
  );
  assert.match(manage, /rescheduleReturnRef\.current\?\.focus\(\)/);
  assert.match(manage, /customerReturnRef\.current\?\.focus\(\)/);
});

test("keeps the three-step checkout and confirmation compact, ordered, and complete on phones", async () => {
  const [booking, publicCss] = await Promise.all([
    readFile(files.booking, "utf8"),
    readFile(files.publicCss, "utf8"),
  ]);

  const stepOneLayout = booking.indexOf('<div className="booking-layout booking-slot-step">');
  const stepTwoLayout = booking.indexOf('<div className="checkout-layout booking-details-view">');
  const stepStarts = [
    booking.lastIndexOf('{step === 1 && (', stepOneLayout),
    booking.lastIndexOf('{step === 2 && (', stepTwoLayout),
    booking.indexOf('{step === 3 && checkoutSlot && pendingBooking && ('),
    booking.indexOf('{step === 4 && confirmedBooking && ('),
  ];
  assert.ok(
    stepStarts.every((start) => start >= 0) &&
      stepStarts.every((start, index) => index === 0 || start > stepStarts[index - 1]),
    "expected Choose, Details, Payment, and confirmation branches in order",
  );

  const [stepOneStart, stepTwoStart, stepThreeStart, stepFourStart] = stepStarts;
  const stepOne = booking.slice(stepOneStart, stepTwoStart);
  const stepTwo = booking.slice(stepTwoStart, stepThreeStart);
  const stepThree = booking.slice(stepThreeStart, stepFourStart);
  const rallySummaryStart = booking.indexOf("function RallyBookingSummary(", stepFourStart);
  const rallySummaryEnd = booking.indexOf("type ManageBookingProps", rallySummaryStart);
  assert.ok(rallySummaryStart > stepFourStart && rallySummaryEnd > rallySummaryStart);
  const stepFour = booking.slice(stepFourStart, rallySummaryStart);

  assert.match(
    booking,
    /const stepLabels = \["Courts", "Details", "Payment"\]/,
  );
  assert.match(
    booking,
    /<p className="booking-step-summary">[\s\S]*?<span>\{step\} of \{stepLabels\.length\} ·<\/span>[\s\S]*?<strong>\{stepLabels\[step - 1\]\}<\/strong>/,
  );
  assert.match(stepOne, /<span className="step-chip">01<\/span>[\s\S]*?Court booking[\s\S]*?<h3>Choose your slots<\/h3>/);
  assert.doesNotMatch(stepOne, /When are you playing\?|schedule-kicker|schedule-scroll-hint/);
  assert.match(booking, /className="booking-compact-title"[\s\S]*?className="back-link"[\s\S]*?Almost yours[\s\S]*?<h2>Who&apos;s playing\?<\/h2>/);
  assert.match(stepTwo, /<span className="step-chip">02<\/span>[\s\S]*?Player details[\s\S]*?<h3>Tell us who to expect<\/h3>/);
  assert.doesNotMatch(stepTwo, /Who&apos;s rallying\?|className="guest-note"/);
  assert.match(
    stepThree,
    /className="checkout-layout booking-payment-view"[\s\S]*?className="booking-stage surface-card gcash-payment-card"[\s\S]*?className="gcash-heading"[\s\S]*?<span>G<\/span>Cash[\s\S]*?Secure/,
  );
  assert.match(
    booking,
    /\{step === 3 && \([\s\S]*?className="booking-compact-title"[\s\S]*?Secure checkout[\s\S]*?<h2>Pay with \{paymentLabel\}<\/h2>/,
  );
  assert.match(stepFour, /className="rally-confirmation-view" role="status" aria-live="polite"/);
  assert.match(stepFour, /className=\{`rally-confirmation-card \$\{confirmationTone\}`\}/);
  assert.match(stepFour, /Your court is ready\./);
  assert.match(stepFour, /\$\{activeTenant\.identity\.shortName\} is reviewing your receipt\./);
  assert.match(stepFour, /Payment needs attention/);
  assert.match(stepFour, /Add to calendar[\s\S]*?Share booking/);
  assert.match(
    stepOne,
    /\{selectedSlots\.length > 0 && <p className="date-selection-note">Changing the date clears your selected court-hours\.<\/p>\}/,
  );
  assert.equal((stepOne.match(/className="date-selection-note"/g) ?? []).length, 1);

  assert.match(
    stepTwo,
    /className="checkout-layout booking-details-view"/,
  );
  const stepTwoSummary = stepTwo.indexOf("<RallyBookingSummary");
  const stepTwoForm = stepTwo.indexOf(
    '<form className="booking-main-card booking-details-form booking-stage surface-card guest-form"',
  );
  const stepTwoHeading = stepTwo.indexOf("Tell us who to expect");
  assert.ok(
    stepTwoSummary >= 0 &&
      stepTwoForm >= 0 &&
      stepTwoSummary > stepTwoForm &&
      stepTwoHeading > stepTwoForm,
    "expected the RallyOS form followed by its mobile-first reservation summary",
  );

  const summarySource = booking.slice(rallySummaryStart, rallySummaryEnd);
  assert.match(summarySource, /aria-label="Booking summary"/);
  assert.match(
    summarySource,
    /className="player-kicker">Your reservation[\s\S]*?courts reserved[\s\S]*?\{dateLabel\}[\s\S]*?\{slotLabel\}/,
  );
  assert.match(summarySource, /className="summary-detail"[\s\S]*?activeTenant\.identity\.name/);
  assert.match(summarySource, /className="summary-price-lines"/);
  assert.match(summarySource, /Court reservation[\s\S]*Booking fee[\s\S]*rally-summary-total[\s\S]*Total/);
  assert.match(
    summarySource,
    /policyTitle \? `\$\{policyTitle\} applies to this reservation\.` : activeTenant\.booking\.cancellation \|\| "Cancellation details will appear after the venue publishes its policy\."/,
  );
  assert.match(stepTwo, /name="fullName"[\s\S]*?required/);
  assert.match(stepTwo, /name="phone"[\s\S]*?required/);
  assert.match(stepTwo, /name="email"[\s\S]*?required/);
  assert.match(stepTwo, /aria-invalid=\{Boolean\(detailErrors\./);
  assert.match(stepTwo, /className="field-error"/);
  assert.match(stepTwo, /aria-busy=\{isSubmitting\}/);
  assert.match(stepTwo, /className="details-hold-gate"/);
  assert.match(stepTwo, /Slots held/);
  assert.match(stepTwo, /className="policy-grid policy-grid-single"/);
  assert.match(stepTwo, /className=\{`check-row policy-check/);
  assert.match(stepTwo, /id=\{`\$\{formId\}-policy`\}/);
  assert.doesNotMatch(stepOne, /turnstile|Security check/i);
  assert.doesNotMatch(stepTwo, /details-security-boundary|Verification required|Required before we hold the court/);
  assert.match(
    stepTwo,
    /\{paymentError && \([\s\S]*?className="payment-error" role="alert"[\s\S]*?We couldn&apos;t save your details/,
  );
  assert.match(
    stepTwo,
    /data-testid="hold-and-pay"[\s\S]*?type="submit"[\s\S]*?disabled=\{isSubmitting \|\| holdExpired \|\| !acceptedPolicy \|\| !liveSelectionSupported\}[\s\S]*?Saving details[\s\S]*?Review payment/,
  );
  assert.match(stepOne, /data-testid="booking-continue"[\s\S]*?createSelectionHold\(\)[\s\S]*?Hold &amp; continue/);
  assert.match(stepTwo, /className="stage-footer form-footer">[\s\S]*?By continuing, you agree to the venue booking policy/);

  const policyDisclosures =
    stepTwo.match(/<details className="policy-disclosure">[\s\S]*?<\/details>/g) ?? [];
  assert.equal(policyDisclosures.length, 1);
  assert.match(
    policyDisclosures[0],
    /<summary>[\s\S]*?<strong>\{policyTitle\}<\/strong><small>View rules<\/small><\/summary>/,
  );
  assert.match(
    policyDisclosures[0],
    /<p><strong>Booking and cancellation<\/strong><br \/>\{policyIntro\}<\/p>[\s\S]*?<p><strong>Rescheduling<\/strong><br \/>\{policyContent\}<\/p>/,
  );
  assert.match(policyDisclosures[0], /\{policyTitle\}/);
  assert.match(stepTwo, /className="policy-grid policy-grid-single"/);
  assert.match(
    cssBlock(publicCss, ".policy-grid.policy-grid-single"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    stepFour,
    /\{step === 4 && confirmedBooking && \(/,
  );
  assert.match(
    stepThree,
    /\{step === 3 && checkoutSlot && pendingBooking && \([\s\S]*?className="checkout-layout booking-payment-view"/,
  );
  assert.match(
    stepThree,
    /className="payment-amount"[\s\S]*?Amount due[\s\S]*?<strong>\{peso\(checkoutTotal\)\}<\/strong>[\s\S]*?Send this exact amount so we can match your payment/,
  );
  assert.doesNotMatch(stepThree, /Exact amount to send|Send exactly/);
  assert.match(stepThree, /Pay this verified court account[\s\S]*?published by the \{activeTenant\.identity\.shortName\} court owner/);
  assert.match(
    stepThree,
    /className="payment-destination"[\s\S]*?Send payment to[\s\S]*?Venue verified[\s\S]*?className="payment-recipient"[\s\S]*?Recipient name[\s\S]*?paymentAccountName[\s\S]*?className="gcash-account-number"[\s\S]*?paymentAccountDisplay/,
  );
  assert.match(
    booking,
    /const paymentAccountCopyValue =[\s\S]*?`\+63\$\{gcashLocalDigits\}`[\s\S]*?async function copyPaymentAccount\(\)[\s\S]*?navigator\.clipboard\.writeText\(paymentAccountCopyValue\)[\s\S]*?setPaymentCopyState\("copied"\)/,
  );
  assert.match(
    stepThree,
    /type="button" className="copy-payment-button"[\s\S]*?aria-label="Copy payment number"[\s\S]*?Copied[\s\S]*?className=\{`payment-copy-feedback[\s\S]*?role="status" aria-live="polite"/,
  );
  assert.match(stepThree, /<span>\{isGcashPayment \? "Mobile number" : "Account number"\}<\/span>/);
  assert.match(stepThree, /<label htmlFor=\{`\$\{formId\}-payment-reference`\}>Reference number<\/label>/);
  assert.doesNotMatch(stepThree, /\{paymentLabel\} (?:mobile|reference) number/);
  assert.doesNotMatch(stepThree, /<input[^>]+paymentAccountDisplay|readOnly[^>]+paymentAccountDisplay/);
  assert.doesNotMatch(stepThree, /data-testid="submit-receipt"|Submit receipt/);
  assert.match(
    stepThree,
    /onChange=\{\(event\) => \{[\s\S]*?const file = event\.target\.files\?\.\[0\][\s\S]*?void prepareReceipt\(file\)/,
  );
  assert.doesNotMatch(stepThree, /onBlur=\{[\s\S]*?submitPayment/);
  assert.doesNotMatch(stepThree, /void submitPayment\(file\)|void submitPayment\(receiptFile\)/);
  assert.match(stepThree, /Preparing receipt…[\s\S]*?Receipt attached · ready to submit[\s\S]*?role="status" aria-live="polite"/);
  assert.match(
    stepThree,
    /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void submitPayment\(\); \}\}[\s\S]*?data-testid="submit-payment"[\s\S]*?type="submit"[\s\S]*?Submit payment for review/,
  );
  assert.match(
    booking,
    /async function prepareReceipt\(file: File \| null\)[\s\S]*?await file\.slice\(0, Math\.min\(file\.size, 64 \* 1024\)\)\.arrayBuffer\(\)[\s\S]*?setReceiptUploadState\("ready"\)/,
  );
  assert.match(
    booking,
    /async function submitPayment\(\)[\s\S]*?setReceiptUploadState\("submitting"\)[\s\S]*?adapter\.submitPayment\(/,
  );
  assert.match(
    booking,
    /const receiptSubmissionInFlightRef = useRef\(false\)[\s\S]*?if \(receiptSubmissionInFlightRef\.current\) return;[\s\S]*?receiptSubmissionInFlightRef\.current = true;[\s\S]*?finally \{[\s\S]*?receiptSubmissionInFlightRef\.current = false;/,
  );
  assert.match(stepThree, /className="payment-error" role="alert"/);
  assert.match(stepThree, /aria-busy=\{isSubmitting\}/);
  assert.equal((stepThree.match(/<RallyBookingSummary\b/g) ?? []).length, 0);
  assert.equal((stepTwo.match(/<RallyBookingSummary\b/g) ?? []).length, 1);
  assert.equal((stepFour.match(/<BookingSummary\b/g) ?? []).length, 0);
  assert.doesNotMatch(stepThree, /Interactive payment demo|GCash payment preview|payment-panel-preview/);
  assert.doesNotMatch(stepTwo, /payment-panel|Submit GCash receipt|payment-reference/);
  assert.doesNotMatch(
    booking,
    /booking-review-step|review-to-payment|Review booking|One last look|data-testid="reserve-slot"/,
  );

  const mobileDetailsLayout = cssBlock(publicCss, ".booking-route .checkout-layout.booking-details-view");
  assert.match(mobileDetailsLayout, /grid-template-columns:\s*minmax\(0,\s*1\.65fr\)\s*minmax\(270px,\s*0\.72fr\)/s);
  assert.match(publicCss, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.booking-route \.booking-details-view \.rally-booking-summary\s*\{[^}]*grid-row:\s*1/s);
  const paymentLayout = cssBlock(publicCss, ".booking-route .checkout-layout.booking-payment-view");
  assert.match(paymentLayout, /grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*?width:\s*min\(100%,\s*760px\)[\s\S]*?margin-inline:\s*auto/s);
  assert.match(
    cssBlock(publicCss, ".booking-route .payment-destination"),
    /border-radius:\s*16px[\s\S]*?background:\s*linear-gradient/,
  );
  assert.match(
    cssBlock(publicCss, ".booking-route .copy-payment-button"),
    /min-height:\s*44px[\s\S]*?cursor:\s*pointer/,
  );
  assert.match(
    publicCss,
    /@media\s*\(max-width:\s*430px\)[\s\S]*?\.booking-route \.gcash-account-number\s*\{[^}]*flex-direction:\s*column[\s\S]*?\.booking-route \.copy-payment-button\s*\{[^}]*width:\s*100%/s,
  );

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
  assert.match(
    mobileCss,
    /\.court-card\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(116px,\s*32%\)\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    mobileCss,
    /\.mini-court\s*\{[^}]*min-height:\s*156px/s,
  );
  assert.match(
    mobileCss,
    /\.booking-shell\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent[^}]*padding:\s*0[^}]*box-shadow:\s*none/s,
  );
  assert.match(mobileCss, /\.booking-choice-heading\s*\{\s*display:\s*none;?\s*\}/);
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
  assert.doesNotMatch(
    summarySource,
    /summary-score|summary-heading|booking-summary > h3|<dl>|summary-footnote/,
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
  assert.match(publicCss, /\.booking-route \.payment-evidence-fields\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
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
  assert.match(globalsCss, /--text-micro:\s*0\.6875rem/);
  assert.match(globalsCss, /--text-caption:\s*0\.75rem/);
  assert.match(globalsCss, /--text-small:\s*0\.875rem/);
  assert.match(globalsCss, /--text-nav:\s*0\.8125rem/);
  assert.match(globalsCss, /--text-body:\s*0\.9375rem/);
  assert.match(globalsCss, /--text-title:\s*clamp\(/);
  assert.match(globalsCss, /img\s*\{[^}]*max-width:\s*100%/s);
  assert.match(globalsCss, /:focus-visible\s*\{[^}]*outline:/s);
  assert.match(globalsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  assert.match(
    publicCss,
    /\.site-container\s*\{[^}]*width:\s*min\(1180px,\s*calc\(100% - 32px\)\)/s,
  );
  assert.match(
    booking,
    /<div className="site-container booking-container">[\s\S]*?<div className="booking-shell">/,
  );
  const widePublicCss = cssBlock(publicCss, "@media (min-width: 1180px)");
  assert.match(
    widePublicCss,
    /\.booking-container\s*\{[^}]*width:\s*min\(1440px,\s*calc\(100% - 48px\)\)/s,
  );
  assert.doesNotMatch(
    publicCss.slice(0, publicCss.indexOf("@media (min-width: 1180px)")),
    /\.site-container\s*\{[^}]*1440px/s,
  );
  assert.match(publicCss, /\.button\s*\{[^}]*min-height:\s*42px/s);
  assert.match(publicCss, /\.button-small\s*\{[^}]*min-height:\s*40px/s);
  assert.match(publicCss, /\.text-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(publicCss, /\.mode-switch a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(publicCss, /\.header-inner\s*\{[^}]*min-height:\s*58px/s);
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
    /const tickerPhrases = \["LOCAL COURTS", "GOOD RALLIES", "YOUR CREW", "K&L PICKLEBALL"\] as const/,
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
    /\.primary-nav\s*>\s*a,\s*\.primary-nav\s*>\s*button\s*\{[^}]*font-size:\s*var\(--text-nav\)[^}]*font-weight:\s*var\(--weight-medium\)/s,
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
    /@media\s*\(min-width:\s*780px\)[\s\S]*?\.header-inner\s*\{[^}]*min-height:\s*62px[^}]*\}[\s\S]*?\.header-inner\s*>\s*\.wordmark\s*\{[^}]*width:\s*164px[^}]*\}[\s\S]*?\.hero-grid\s*\{[^}]*padding-top:\s*120px[^}]*\}[\s\S]*?\.ticker-track\s*\{\s*animation-duration:\s*20s/s,
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
    /@media\s*\(min-width:\s*980px\)[\s\S]*?\.hero-grid\s*\{[^}]*grid-template-columns:[^}]*min-height:\s*620px[^}]*padding-top:\s*82px[^}]*\}[\s\S]*?\.hero-visual\s*\{[^}]*min-height:\s*480px/s,
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
    /@media\s*\(max-width:\s*680px\)[\s\S]*?\.bookingRecord\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*grid-template-areas:\s*"identity"\s*"session"\s*"payment"\s*"status"\s*"footer"[^}]*\}[\s\S]*?\.bookingRecordFooter\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    manageCss,
    /\.bookingRecordActions \.reviewPaymentButton\s*\{[^}]*min-height:\s*34px[^}]*\}[\s\S]*?\.bookingRecordActions \.miniButton,[\s\S]*?\.bookingRecordActions \.moreButton\s*\{[^}]*min-height:\s*34px/s,
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
    /className=\{`availability-cell mobile-availability-cell\$\{displayedState \? ` owned-state owned-\$\{displayedState\}` : busy \? " busy" : isSelected \? " selected" : ""\}`\}/,
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
  assert.ok(manageRemTypeSizes.every((size) => size >= 0.5));

  for (const css of [publicCss, manageCss]) {
    const numericWeights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map(
      (match) => Number(match[1]),
    );
    assert.ok(
      numericWeights.every((weight) => weight >= 400 && weight <= 800),
    );
  }
});
