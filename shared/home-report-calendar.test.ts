import assert from "node:assert/strict";
import { test } from "node:test";
import { createHomeReportCalendar, shiftHomeReportDate, resolveOrganizationTimezone } from "./home-report-calendar";

test("Home calendar uses local day/hour, including transactions near UTC midnight", () => {
  const riyadh = createHomeReportCalendar("Asia/Riyadh");
  const india = createHomeReportCalendar("Asia/Kolkata");
  assert.equal(riyadh.dateKey(new Date("2026-10-03T22:30:00Z")), "2026-10-04");
  assert.equal(riyadh.hour(new Date("2026-10-04T06:00:00Z")), 9);
  assert.equal(india.hour(new Date("2026-10-04T03:30:00Z")), 9);
  assert.equal(india.dayStart("2026-10-04").toISOString(), "2026-10-03T18:30:00.000Z");
  assert.equal(riyadh.dayStart("2026-10-04").toISOString(), "2026-10-03T21:00:00.000Z");
});

test("Home calendar handles negative offsets and daylight saving day boundaries", () => {
  const calendar = createHomeReportCalendar("America/New_York");
  assert.equal(calendar.dateKey(new Date("2026-10-04T02:30:00Z")), "2026-10-03");
  const hours = (start: string, end: string) =>
    (calendar.dayStart(end).getTime() - calendar.dayStart(start).getTime()) / 3_600_000;
  assert.equal(hours("2026-03-08", "2026-03-09"), 23);
  assert.equal(hours("2026-11-01", "2026-11-02"), 25);
  assert.equal(calendar.hour(new Date("2026-11-01T05:30:00Z")), 1);
  assert.equal(calendar.hour(new Date("2026-11-01T06:30:00Z")), 1);
});

test("Home date-only arithmetic preserves month/year/leap-day boundaries", () => {
  assert.equal(shiftHomeReportDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftHomeReportDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftHomeReportDate("2026-10-04", -365), "2025-10-04");
  assert.throws(() => createHomeReportCalendar("Not/A_TimeZone"), RangeError);
});

test("organisation default is IST and timestamps/weekday change at IST midnight", () => {
  assert.equal(resolveOrganizationTimezone(undefined), "Asia/Kolkata");
  assert.equal(resolveOrganizationTimezone(null), "Asia/Kolkata");
  assert.equal(resolveOrganizationTimezone("America/New_York"), "America/New_York");
  const calendar = createHomeReportCalendar(resolveOrganizationTimezone("Asia/Kolkata"));
  const beforeMidnight = new Date("2026-10-04T18:29:59.999Z");
  const midnight = new Date("2026-10-04T18:30:00.000Z");
  assert.equal(calendar.timestamp(beforeMidnight), "2026-10-04 23:59:59");
  assert.equal(calendar.timestamp(midnight), "2026-10-05 00:00:00");
  assert.equal(calendar.weekday(beforeMidnight), 0);
  assert.equal(calendar.weekday(midnight), 1);
  assert.equal(calendar.hour(midnight), 0);
});