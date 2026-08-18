import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingPath = new URL("../app/booking-experience.tsx", import.meta.url);
const cssPath = new URL("../app/dinktopia.css", import.meta.url);

test("booking starts on the tenant's current date and keeps elapsed slots unavailable", async () => {
  const booking = await readFile(bookingPath, "utf8");

  assert.match(booking, /timeZone: activeTenant\.identity\.timezone[\s\S]*?return new Date\(Date\.UTC/);
  assert.match(booking, /useState\(dates\[0\]\?\.iso \?\? ""\)/);
  assert.match(booking, /const dateRailDates = useMemo\(\(\) => dates, \[dates\]\)/);
  assert.match(booking, /dateRailDates\.map/);
  assert.match(booking, /date\.isToday \? "Today" : date\.day/);
  assert.doesNotMatch(booking, /dates\.slice\(1, 7\)|index === 0 \? "Tomorrow"/);
  assert.match(booking, /className="mobile-sticky-date"/);
  assert.match(booking, /aria-label="Previous booking date"/);
  assert.match(booking, /aria-label="Next booking date"/);
  assert.match(booking, /Return to all booking dates/);
  assert.doesNotMatch(booking, /function chooseDate[\s\S]*?setSchedule\(\[\]\)[\s\S]*?setSelectedDate\(date\)/);
  assert.match(booking, /visibleAvailabilityState === "loading" && schedule\.length === 0/);
  assert.match(booking, /rally-availability-board\$\{visibleAvailabilityState === "loading" \? " is-refreshing" : ""\}/);
  assert.match(booking, /candidateStartsAt < Date\.now\(\) \+ minimumLeadMinutes \* 60 \* 1000/);
  assert.match(booking, /status: tooSoon \|\| overlapsBlock \|\| overlapsBooking \? "unavailable" : "available"/);
  assert.match(booking, /const hasStarted = candidateStartsAt <= Date\.now\(\)/);
  assert.match(booking, /slot\?\.hasStarted[\s\S]*?\? "Done"/);
});

test("selected booking date uses readable premium foreground colors", async () => {
  const css = await readFile(cssPath, "utf8");
  const finalState = css.slice(css.lastIndexOf("/* Final booking-date state"));

  assert.match(finalState, /background: #e8eef4/);
  assert.match(finalState, /color: #0b2947/);
  assert.match(finalState, /\.date-option\.is-selected :is\(span, small\)[\s\S]*?color: #234f78/);
});
