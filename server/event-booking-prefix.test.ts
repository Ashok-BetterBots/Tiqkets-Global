import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizePreprintedTicketPrefix } from "./events-routes";

test("normalizes valid event pre-printed ticket prefixes", () => {
  assert.equal(normalizePreprintedTicketPrefix(undefined), "EVT");
  assert.equal(normalizePreprintedTicketPrefix(" vip- "), "VIP");
  assert.equal(normalizePreprintedTicketPrefix("gate42"), "GATE42");
});

test("rejects prefixes that cannot fit the global booking ID format", () => {
  for (const value of ["A", "TOO-LONG-PREFIX", "BAD VALUE", "EVENT_1"]) {
    assert.throws(() => normalizePreprintedTicketPrefix(value), /2–8 letters or numbers/);
  }
});

test("customer, staff-generated, and pre-printed booking IDs use the correct prefixes and retain global registry reservation", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const schema = readFileSync("shared/schema.ts", "utf8");
  const dashboard = readFileSync("server/templates/dashboard.html", "utf8");

  assert.match(routes, /return `TIQ-\$\{s\}`/);
  assert.match(routes, /return `\$\{normalizePreprintedTicketPrefix\(prefix\)\}-\$\{s\}`/);
  assert.match(routes, /reg\.registrationSource === "store"\s*\?\s*ev\.preprintedTicketPrefix\s*:\s*undefined/);
  assert.match(routes, /reserveGeneratedTicketId\(tx, ev\.id, staffTicketPrefix\)/);
  assert.match(routes, /staffTicketPrefix\s*\?\s*makePreprintedTicketId\(staffTicketPrefix\)\s*:\s*makeBookingId\(\)/);
  assert.match(routes, /ticketPrefix = normalizePreprintedTicketPrefix\(ev\.preprintedTicketPrefix\)/);
  assert.match(routes, /preprintedTicketPrefix,/);
  assert.match(routes, /tx\.insert\(eventTicketIdentifiers\)/);
  assert.match(schema, /preprintedTicketPrefix: varchar\("preprinted_ticket_prefix", \{ length: 8 \}\)\.default\("EVT"\)\.notNull\(\)/);
  assert.match(schema, /eventTicketIdentifiers = pgTable\("event_ticket_identifiers"/);
  assert.match(schema, /ticketId: varchar\("ticket_id", \{ length: 20 \}\)\.primaryKey\(\)/);
  assert.match(dashboard, /x-model="eventForm\.preprintedTicketPrefix"/);
  assert.match(dashboard, /preprintedTicketPrefix: ev\.preprintedTicketPrefix \|\| 'EVT'/);
  assert.match(dashboard, /preprintedTicketPrefix,/);
});