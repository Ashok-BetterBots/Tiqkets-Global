import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTicketTimingStatus } from "../client/components/event/ticketTiming";

const NOW = new Date(2026, 8, 11, 12, 0, 0).getTime();

test("classifies tickets within the inclusive thirty-minute display window", () => {
  assert.equal(getTicketTimingStatus("2026-09-11", "11:30", NOW)?.kind, "within-window");
  assert.equal(getTicketTimingStatus("2026-09-11", "12:30", NOW)?.kind, "within-window");
});

test("classifies same-day early and late arrivals beyond thirty minutes", () => {
  assert.deepEqual(getTicketTimingStatus("2026-09-11", "13:35", NOW), {
    kind: "same-day-offset",
    direction: "early",
    diffMinutes: 95,
    diffDays: 0,
  });
  assert.deepEqual(getTicketTimingStatus("2026-09-11", "10:25", NOW), {
    kind: "same-day-offset",
    direction: "late",
    diffMinutes: 95,
    diffDays: 0,
  });
});

test("classifies wrong-date arrivals by calendar-day difference", () => {
  assert.equal(getTicketTimingStatus("2026-09-12", "12:00", NOW)?.direction, "early");
  assert.equal(getTicketTimingStatus("2026-09-12", "12:00", NOW)?.diffDays, 1);
  assert.equal(getTicketTimingStatus("2026-09-10", "12:00", NOW)?.direction, "late");
  assert.equal(getTicketTimingStatus("2026-09-10", "12:00", NOW)?.diffDays, 1);
});

test("keeps lookup and check-in APIs unchanged while adding the timing display gate", () => {
  const screen = readFileSync("client/screens/event/EventCheckInScreen.tsx", "utf8");
  const modal = readFileSync("client/components/event/TicketScanResultModal.tsx", "utf8");

  assert.match(screen, /\/api\/dashboard\/events\/scan\/lookup/);
  assert.match(screen, /apiRequest\("POST", "\/api\/dashboard\/events\/scan"/);
  assert.match(modal, /testID="ticket-valid-corner-tick"/);
  assert.match(modal, /testID="button-timing-skip"/);
  assert.match(modal, /testID="button-timing-proceed"/);
  assert.match(modal, /timingStatus\.kind === "different-day"/);
});