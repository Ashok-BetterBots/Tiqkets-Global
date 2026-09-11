import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Add Customer uses date-dependent date and time chip selectors", () => {
  const source = readFileSync("client/components/EventManualRegModal.tsx", "utf8");

  assert.match(source, /testID="manual-reg-date-chip-list"/);
  assert.match(source, /testID="manual-reg-time-chip-list"/);
  assert.match(source, /horizontal\s+showsHorizontalScrollIndicator=\{false\}/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /setField\(\{ slotDate: day\.date, slotTime: "" \}\)/);
  assert.match(source, /const selectedTimeSlot = useMemo/);
  assert.match(source, /selectedTimeSlot\.available\.toLocaleString\("en-IN"\)/);
  assert.match(source, /selectedTimeSlot \? \(/);

  assert.doesNotMatch(source, /testID="button-manual-reg-date"/);
  assert.doesNotMatch(source, /testID="button-manual-reg-time"/);
  assert.doesNotMatch(source, /showDateDropdown/);
  assert.doesNotMatch(source, /showTimeDropdown/);
});