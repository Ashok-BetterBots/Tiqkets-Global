import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Add Customer modal resizes above the Android keyboard", () => {
  const source = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
  const appConfig = readFileSync("app.json", "utf8");

  assert.match(source, /<Modal/);
  assert.match(source, /behavior=\{Platform\.OS === "ios" \? "padding" : "height"\}/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /<Animated\.View/);
  assert.match(source, /measureInWindow/);
  assert.match(source, /Keyboard\.addListener\("keyboardDidShow"/);
  assert.doesNotMatch(source, /scrollResponderScrollNativeHandleToKeyboard/);
  assert.match(appConfig, /"softwareKeyboardLayoutMode": "resize"/);
});