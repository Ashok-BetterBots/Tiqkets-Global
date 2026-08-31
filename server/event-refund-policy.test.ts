import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeEventRefundPolicy,
  resolveLocationConfig,
} from "./events-routes";

test("existing events default to non-refundable with no message", () => {
  assert.deepEqual(normalizeEventRefundPolicy(undefined), {
    refundable: false,
    refundMessage: "",
  });
});

test("refund policy accepts only strict booleans and bounded text", () => {
  assert.deepEqual(normalizeEventRefundPolicy({
    refundable: true,
    refundMessage: "  Refundable until 24 hours before entry.  ",
  }), {
    refundable: true,
    refundMessage: "Refundable until 24 hours before entry.",
  });
  assert.throws(
    () => normalizeEventRefundPolicy({ refundable: "true" }),
    /must be a boolean/,
  );
  assert.throws(
    () => normalizeEventRefundPolicy({ refundable: true, refundMessage: 123 }),
    /must be text/,
  );
  assert.throws(
    () => normalizeEventRefundPolicy({ refundable: true, other: false }),
    /Unknown refund policy setting/,
  );
  assert.throws(
    () => normalizeEventRefundPolicy({ refundable: true, refundMessage: "x".repeat(1001) }),
    /1,000 characters or fewer/,
  );
});

test("location refund values override event defaults and otherwise fall back", () => {
  const event = {
    operatingHoursStart: "09:00",
    operatingHoursEnd: "21:00",
    slotDurationMinutes: 30,
    maxCapacityPerSlot: 50,
    registrationFee: 5000,
    refundable: true,
    refundMessage: "Event policy",
  } as any;

  const fallback = resolveLocationConfig(event, { serviceSettings: { event: {} } });
  assert.equal(fallback.refundable, true);
  assert.equal(fallback.refundMessage, "Event policy");
  assert.equal(fallback.registrationFee, 5000);

  const overridden = resolveLocationConfig(event, {
    serviceSettings: {
      event: {
        registrationFee: 7500,
        refundable: false,
        refundMessage: "Location policy",
      },
    },
  });
  assert.equal(overridden.refundable, false);
  assert.equal(overridden.refundMessage, "Location policy");
  assert.equal(overridden.registrationFee, 7500);

  const explicitlyCleared = resolveLocationConfig(event, {
    serviceSettings: {
      event: {
        refundable: false,
        refundMessage: "",
      },
    },
  });
  assert.equal(explicitlyCleared.refundable, false);
  assert.equal(explicitlyCleared.refundMessage, "");
});

test("public landing carries refund policy without duplicating it in the fee summary", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const landing = readFileSync("server/templates/event-landing.html", "utf8");

  assert.match(routes, /refundable:\s*ev\.refundable === true/);
  assert.match(routes, /refundMessage:\s*typeof ev\.refundMessage/);
  assert.match(routes, /refundable:\s*cfg\.refundable/);
  assert.match(routes, /refundMessage:\s*cfg\.refundMessage/);
  assert.doesNotMatch(landing, /id="refundPolicy"/);
  assert.doesNotMatch(landing, /summary\.nonRefundable/);
  assert.doesNotMatch(landing, /refundPolicyMessage/);
});

test("registration fee custom text replaces the hard-coded advance note", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const landing = readFileSync("server/templates/event-landing.html", "utf8");
  const schema = readFileSync("shared/schema.ts", "utf8");

  assert.match(schema, /registrationFeeCustomText:\s*text\("registration_fee_custom_text"\)/);
  assert.match(routes, /registrationFeeCustomText:\s*ev\.registrationFeeCustomText/);
  assert.match(routes, /registrationFeeCustomText:\s*cfg\.registrationFeeCustomText/);
  assert.match(landing, /note\.textContent = currentRegistrationFeeCustomText/);
  assert.match(landing, /note\.classList\.toggle\("hidden", fee <= 0 \|\| !currentRegistrationFeeCustomText\)/);
  assert.match(landing, /\.advance-note \{[\s\S]*font-size: 11px;[\s\S]*line-height: 1\.45;[\s\S]*color: var\(--brand-primary\);/);
  assert.doesNotMatch(landing, /fully redeemable at billing/);
});

test("Tamil selection is not overwritten by a phone language hint", () => {
  const landing = readFileSync("server/templates/event-landing.html", "utf8");

  assert.match(
    landing,
    /if \(languageExplicitlyChosen \|\| currentLang !== "en" \|\| !branchId\) return;/,
  );
  assert.match(landing, /preferredLanguage:\s*currentLang/);
});

test("refund guidance stays independent of registration fee and Razorpay amount", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const landing = readFileSync("server/templates/event-landing.html", "utf8");

  assert.match(routes, /const fee = cfg\.registrationFee \|\| 0/);
  assert.match(routes, /amount:\s*fee,\s*currency:\s*"INR"/);
  assert.match(landing, /var fee = currentFee \|\| 0/);
  assert.doesNotMatch(routes, /amount:\s*(?:refundPolicy|refundMessage|refundable)/);
});

test("web and native settings persist event and location refund controls", () => {
  const web = readFileSync("server/templates/dashboard.html", "utf8");
  const nativeEvent = readFileSync("client/screens/org/OrgEventManageScreen.tsx", "utf8");
  const nativeLocation = readFileSync("client/screens/org/OrgEventLocationsScreen.tsx", "utf8");

  for (const source of [web, nativeEvent, nativeLocation]) {
    assert.match(source, /refundable/i);
    assert.match(source, /refundMessage/);
  }
  assert.match(web, /refundable:\s*f\.refundable === true/);
  assert.match(web, /refundable:\s*this\.locationForm\.refundable === true/);
  assert.match(nativeEvent, /refundable:\s*form\.refundable/);
  assert.match(nativeLocation, /refundable:\s*config\.refundable/);
});