import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { formatEventSlotRange } from "@shared/eventSlots";

describe("event registration slot display", () => {
  test("formats the slot start and end using the configured duration", () => {
    assert.equal(formatEventSlotRange("09:00", 180), "9:00 AM to 12:00 PM");
    assert.equal(formatEventSlotRange("12:30", 45), "12:30 PM to 1:15 PM");
  });

  test("keeps both registration surfaces as dropdown selectors", () => {
    const nativeModal = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
    const landing = readFileSync("server/templates/event-landing.html", "utf8");

    assert.match(nativeModal, /testID="button-manual-reg-time"/);
    assert.match(nativeModal, /formatEventSlotRange/);
    assert.match(landing, /id="timeSelect"/);
    assert.match(landing, /handleTimeSelectChange/);
    assert.match(landing, /slot\.available \+ " " \+ t\("reg\.left"\)/);
    assert.match(landing, /slot\.rangeLabel \|\| slot\.label/);
    assert.ok(
      (landing.match(/timeLabel = slot\.rangeLabel \|\| slot\.label/g) || []).length >= 2,
      "review and completion summaries should retain the slot range",
    );
  });

  test("shows the three-hour gift notice in the selected registration language", () => {
    const landing = readFileSync("server/templates/event-landing.html", "utf8");

    assert.match(landing, /class="schedule-gift-card"/);
    assert.match(landing, /data-i18n="reg\.giftTitle"/);
    assert.match(landing, /data-i18n="reg\.giftMessage"/);
    assert.match(landing, /Enter and exit the shop within 3 hours to receive a surprise gift\./);
    assert.match(landing, /கடைக்குள் நுழைந்த 3 மணி நேரத்திற்குள் வெளியேறினால்/);
  });
});