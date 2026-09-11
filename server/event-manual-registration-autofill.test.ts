import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function inputBlock(source: string, testId: string) {
  const testIdIndex = source.indexOf(`testID="${testId}"`);
  assert.notEqual(testIdIndex, -1, `${testId} should exist`);
  return source.slice(source.lastIndexOf("<TextInput", testIdIndex), testIdIndex);
}

test("Add Customer disables Android autofill only for phone and email", () => {
  const source = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
  const phoneInput = inputBlock(source, "input-manual-reg-phone");
  const emailInput = inputBlock(source, "input-manual-reg-email");
  const nameInput = inputBlock(source, "input-manual-reg-name");
  const guestsInput = inputBlock(source, "input-manual-reg-guests");

  for (const input of [phoneInput, emailInput]) {
    assert.match(input, /autoComplete=\{Platform\.OS === "android" \? "off" : undefined\}/);
    assert.match(input, /importantForAutofill=\{Platform\.OS === "android" \? "no" : undefined\}/);
    assert.match(input, /autoCorrect=\{Platform\.OS === "android" \? false : undefined\}/);
  }

  assert.match(phoneInput, /keyboardType="phone-pad"/);
  assert.match(emailInput, /keyboardType="email-address"/);
  assert.doesNotMatch(nameInput, /importantForAutofill/);
  assert.doesNotMatch(guestsInput, /importantForAutofill/);
});