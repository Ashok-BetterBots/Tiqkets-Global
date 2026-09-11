import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Add Customer modal uses Android keyboard avoidance and focused-input scrolling", () => {
  const source = readFileSync("client/components/EventManualRegModal.tsx", "utf8");

  assert.match(source, /behavior=\{Platform\.OS === "ios" \? "padding" : "height"\}/);
  assert.doesNotMatch(source, /KeyboardAwareScrollViewCompat/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /scrollResponderScrollNativeHandleToKeyboard/);
  assert.match(source, /Keyboard\.addListener\("keyboardDidShow"/);
  assert.match(source, /getScrollResponder\?\.\(\) \?\? formScrollRef\.current/);
  assert.match(source, /ref=\{customerNameInputRef\}/);
  assert.match(source, /ref=\{customerPhoneInputRef\}/);
  assert.match(source, /ref=\{customerEmailInputRef\}/);
  assert.match(source, /ref=\{extraGuestsInputRef\}/);
});