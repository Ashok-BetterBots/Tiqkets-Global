import assert from "node:assert/strict";
import test from "node:test";
import {
  getExactTicketIdCandidates,
  getPartialTicketIdPatterns,
  normalizeTicketIdSearchInput,
} from "./event-ticket-id-search";

test("normalizes ticket ID search input without changing its matching mode", () => {
  assert.equal(normalizeTicketIdSearchInput("  evt-abc123  "), "EVT-ABC123");
});

test("keeps generated, legacy, and custom prefixed IDs as the sole exact candidate", () => {
  assert.deepEqual(getExactTicketIdCandidates(" tiq-1234 "), ["TIQ-1234"]);
  assert.deepEqual(getExactTicketIdCandidates(" evt-1234 "), ["EVT-1234"]);
  assert.deepEqual(getExactTicketIdCandidates("ptk-a9"), ["PTK-A9"]);
  assert.deepEqual(getExactTicketIdCandidates("vip-a9"), ["VIP-A9"]);
});

test("adds generated and legacy prefixes for unprefixed exact IDs", () => {
  assert.deepEqual(getExactTicketIdCandidates(" 1234 "), [
    "1234",
    "TIQ-1234",
    "EVT-1234",
    "PTK-1234",
  ]);
});

test("preserves partial matching while adding prefix-aware patterns", () => {
  assert.deepEqual(getPartialTicketIdPatterns(" ab12 "), [
    "%AB12%",
    "%TIQ-AB12%",
    "%EVT-AB12%",
    "%PTK-AB12%",
  ]);
});