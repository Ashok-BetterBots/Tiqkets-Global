import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isEventBillingOtpRequired,
  isEventRegistrationOtpEnabled,
  normalizeEventOtpSettings,
} from "./events-routes";

test("event OTP settings default on and validate strict booleans", () => {
  assert.deepEqual(normalizeEventOtpSettings(undefined), {
    registration: true,
    billing: true,
  });
  assert.deepEqual(normalizeEventOtpSettings({ registration: false }), {
    registration: false,
    billing: true,
  });
  assert.throws(() => normalizeEventOtpSettings({ billing: "false" }), /must be a boolean/);
  assert.throws(() => normalizeEventOtpSettings({ other: false }), /Unknown OTP setting/);
});

test("registration OTP can be disabled per event", () => {
  assert.equal(isEventRegistrationOtpEnabled({ otpSettings: { registration: true, billing: true } }), true);
  assert.equal(isEventRegistrationOtpEnabled({ otpSettings: { registration: false, billing: true } }), false);
});

test("billing OTP bypass matches store registration behavior when disabled", () => {
  const enabled = { otpSettings: { registration: true, billing: true } };
  const disabled = { otpSettings: { registration: true, billing: false } };
  assert.equal(isEventBillingOtpRequired(enabled, true, false), true);
  assert.equal(isEventBillingOtpRequired(enabled, true, true), false);
  assert.equal(isEventBillingOtpRequired(disabled, true, false), false);
  assert.equal(isEventBillingOtpRequired(enabled, false, false), false);
});

test("billing-disabled and store registrations use the same no-OTP result", () => {
  const enabled = { otpSettings: { registration: true, billing: true } };
  const disabled = { otpSettings: { registration: true, billing: false } };
  const inStoreOtpRequired = isEventBillingOtpRequired(enabled, true, true);
  const disabledOtpRequired = isEventBillingOtpRequired(disabled, true, false);
  assert.equal(inStoreOtpRequired, false);
  assert.equal(disabledOtpRequired, inStoreOtpRequired);
});

test("public registration UI skips OTP only when the event setting is disabled", () => {
  const landing = readFileSync(
    new URL("./templates/event-landing.html", import.meta.url),
    "utf8",
  );
  assert.match(landing, /data\.event\.otpSettings\.registration !== false/);
  assert.match(landing, /if \(!registrationOtpEnabled\(\)\)[\s\S]*?goToStep\(3\)/);
  assert.match(landing, /responseData && responseData\.otpRequired === false/);
  assert.match(landing, /data\.otpRequired === false/);
});

test("public registration presents WhatsApp OTP as the second screen", () => {
  const landing = readFileSync(
    new URL("./templates/event-landing.html", import.meta.url),
    "utf8",
  );
  assert.match(landing, /Step 1 of 4/);
  assert.match(
    landing,
    /STEP_IDS = \{ 1: "stepDetails", 2: "stepOtp", 3: "stepSchedule", 4: "stepReview" \}/,
  );
  assert.match(landing, /function showOtpPanel\(phone\) \{[\s\S]*?currentStep = 2/);
  assert.match(landing, /phoneVerificationToken = data\.verificationToken[\s\S]*?goToStep\(3\)/);
  assert.match(landing, /id="step3"[\s\S]*?data-i18n="stepper\.slot"/);
});

test("event settings UIs persist both OTP controls independently", () => {
  const web = readFileSync(
    new URL("./templates/dashboard.html", import.meta.url),
    "utf8",
  );
  const native = readFileSync(
    new URL("../client/screens/org/OrgEventManageScreen.tsx", import.meta.url),
    "utf8",
  );
  for (const source of [web, native]) {
    assert.match(source, /Registration OTP/);
    assert.match(source, /Billing OTP/);
  }
  assert.match(web, /registration:\s*f\.registrationOtpEnabled !== false/);
  assert.match(web, /billing:\s*f\.billingOtpEnabled !== false/);
  assert.match(native, /otpSettings:\s*form\.otpSettings/);
  assert.match(web, /result\.otpRequired === false/);
  const staleBillingBranches = web.match(
    /if \(result\.otpRequired === false\) \{[\s\S]*?this\.eventsBillBusy = false;[\s\S]*?return;/g,
  );
  assert.equal(staleBillingBranches?.length, 2);
});