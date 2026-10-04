import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMonthlyServedTrend } from "./home-monthly-trend";
import { createHomeReportCalendar } from "./home-report-calendar";

test("monthly served totals use real calendar months, include today and exclude future/outside dates", () => {
  const counts = new Map([
    ["2026-07-31", 100], ["2026-08-31", 3], ["2026-09-01", 5],
    ["2026-09-30", 7], ["2026-10-04", 2], ["2026-10-05", 100],
  ]);
  assert.deepEqual(buildMonthlyServedTrend(counts, "2026-10-04", 3), [
    { key: "2026-08", label: "Aug", fullLabel: "Aug 2026", value: 3 },
    { key: "2026-09", label: "Sep", fullLabel: "Sep 2026", value: 12 },
    { key: "2026-10", label: "Oct", fullLabel: "Oct 2026", value: 2 },
  ]);
});

test("empty months are zero-filled for every supported monthly period", () => {
  for (const months of [3, 6, 12]) {
    const buckets = buildMonthlyServedTrend(new Map(), "2026-01-01", months);
    assert.equal(buckets.length, months);
    assert.equal(buckets.at(-1)?.key, "2026-01");
    assert.equal(buckets.reduce((sum, bucket) => sum + bucket.value, 0), 0);
    assert.equal(new Set(buckets.map(bucket => bucket.key)).size, months);
    assert.ok(buckets.every(bucket => bucket.fullLabel.includes(bucket.key.slice(0, 4))));
  }
  assert.equal(buildMonthlyServedTrend(new Map(), "2026-01-01", 12)[0].key, "2025-02");
});

test("monthly boundaries follow IST midnight, not UTC or device month", () => {
  const calendar = createHomeReportCalendar("Asia/Kolkata");
  const counts = new Map([["2026-10-31", 5], ["2026-11-01", 8]]);
  const before = calendar.dateKey(new Date("2026-10-31T18:29:59Z"));
  const after = calendar.dateKey(new Date("2026-10-31T18:30:00Z"));
  assert.equal(buildMonthlyServedTrend(counts, before, 3).at(-1)?.value, 5);
  assert.equal(buildMonthlyServedTrend(counts, after, 3).at(-1)?.key, "2026-11");
  assert.equal(buildMonthlyServedTrend(counts, after, 3).at(-1)?.value, 8);
});

test("leap day is counted once and year-crossing month buckets stay chronological", () => {
  const buckets = buildMonthlyServedTrend(new Map([
    ["2023-12-31", 2], ["2024-01-01", 3], ["2024-02-29", 4],
  ]), "2024-02-29", 3);
  assert.deepEqual(buckets.map(bucket => [bucket.key, bucket.value]), [
    ["2023-12", 2], ["2024-01", 3], ["2024-02", 4],
  ]);
});