import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { formatEventSlotRange } from "@shared/eventSlots";
import { validateEventPriorityAccessDate } from "./events-routes";

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

  test("collects a bilingual icon product category for reporting", () => {
    const landing = readFileSync("server/templates/event-landing.html", "utf8");

    assert.match(landing, /id="productCategory"/);
    assert.match(landing, /data-category="electronics"[^>]*data-label-key="reg\.productCategoryElectronics"/);
    assert.match(landing, /data-category="furniture"[^>]*data-label-key="reg\.productCategoryFurniture"/);
    assert.match(landing, /data-category="home_appliances"[^>]*data-label-key="reg\.productCategoryHomeAppliances"/);
    assert.match(landing, /data-category="vessels"[^>]*data-label-key="reg\.productCategoryVessels"/);
    assert.match(landing, /class="product-category-icon"[^>]*aria-hidden="true"><svg/);
    assert.doesNotMatch(landing, /"reg\.productCategoryElectronics": "📱/);
    assert.match(landing, /productCategory: productCategory/);
    assert.match(landing, /"reg\.productCategory": "நீங்கள் எந்த தயாரிப்பு வகையைத் தேடுகிறீர்கள்\?"/);

    const schema = readFileSync("shared/schema.ts", "utf8");
    const routes = readFileSync("server/events-routes.ts", "utf8");
    const dashboard = readFileSync("server/templates/dashboard.html", "utf8");
    const nativeModal = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
    assert.match(schema, /productCategory: text\("product_category"\)/);
    assert.match(schema, /productCategories: jsonb\("product_categories"\)/);
    assert.match(routes, /productCategory: normalizedProductCategory/);
    assert.match(routes, /productCategories: normalizedProductCategories/);
    assert.match(routes, /allowedProductCategories/);
    assert.match(dashboard, /toggleManualProductCategory\(category\.value\)/);
    assert.match(dashboard, /productCategories: f\.productCategories/);
    assert.match(nativeModal, /productCategories: selected/);
    assert.match(nativeModal, /productCategories: form\.productCategories/);
  });

  test("special categories use icons and lock the final event date", () => {
    const landing = readFileSync("server/templates/event-landing.html", "utf8");

    assert.match(landing, /"reg\.specialNeeds": "Special category"/);
    assert.match(landing, /data-special-category="senior_citizen"/);
    assert.match(landing, /data-special-category="pregnant_women"/);
    assert.match(landing, /data-special-category="infants"/);
    assert.match(landing, /data-special-category="specially_abled"/);
    assert.match(landing, /data-special-category="senior_citizen"[\s\S]*?src="\/assets\/special-categories\/person_1788525899674\.png"/);
    assert.match(landing, /data-special-category="pregnant_women"[\s\S]*?src="\/assets\/special-categories\/pregnant_1788525899674\.png"/);
    assert.match(landing, /data-special-category="infants"[\s\S]*?src="\/assets\/special-categories\/human_1788525899674\.png"/);
    assert.match(landing, /data-special-category="specially_abled"[\s\S]*?src="\/assets\/special-categories\/disabled_1788525899674\.png"/);
    assert.match(landing, /isSpecialNeeds = selectedSpecialCategories\.length > 0/);
    assert.match(landing, /sel\.disabled = isSpecialNeeds/);
    assert.match(landing, /visibleDays = allAvailDays\.length > 0 \? \[allAvailDays\[allAvailDays\.length - 1\]\] : \[\]/);
    assert.match(landing, /priorityAccess: isSpecialNeeds/);
    assert.match(landing, /"reg\.specialNeeds": "சிறப்புப் பிரிவு"/);

    const schema = readFileSync("shared/schema.ts", "utf8");
    const routes = readFileSync("server/events-routes.ts", "utf8");
    const dashboard = readFileSync("server/templates/dashboard.html", "utf8");
    const nativeModal = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
    assert.match(schema, /specialCategories: jsonb\("special_categories"\)/);
    assert.match(routes, /specialCategories: normalizedSpecialCategories/);
    assert.match(dashboard, /specialCategories: this\.manualRegSpecialCategories/);
    assert.match(nativeModal, /specialCategories: form\.selectedSpecialCategories/);
  });

  test("priority date policy matches zero, one, and multiple available-date UI behavior", () => {
    assert.match(
      validateEventPriorityAccessDate([], "2026-09-01", false) || "",
      /No bookable dates/,
    );

    // The UI deliberately permits its only available date for either type.
    assert.equal(validateEventPriorityAccessDate(["2026-09-01"], "2026-09-01", false), null);
    assert.equal(validateEventPriorityAccessDate(["2026-09-01"], "2026-09-01", true), null);

    const dates = ["2026-09-01", "2026-09-02"];
    assert.equal(validateEventPriorityAccessDate(dates, "2026-09-01", false), null);
    assert.match(
      validateEventPriorityAccessDate(dates, "2026-09-02", false) || "",
      /reserved for priority access/,
    );
    assert.match(
      validateEventPriorityAccessDate(dates, "2026-09-01", true) || "",
      /must use the final bookable/,
    );
    assert.equal(validateEventPriorityAccessDate(dates, "2026-09-02", true), null);
  });

  test("warns before review when no special category is selected", () => {
    const landing = readFileSync("server/templates/event-landing.html", "utf8");

    assert.match(landing, /id="specialCategoryWarningModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(landing, /if \(!isSpecialNeeds\) \{\s*openSpecialCategoryWarning\(\);\s*return;/);
    assert.match(landing, /id="specialWarningEditBtn"/);
    assert.match(landing, /id="specialWarningContinueBtn"/);
    assert.match(landing, /closeSpecialCategoryWarning\(\);\s*goToStep\(3\)/);
    assert.match(landing, /"reg\.specialWarningTitle": "Before you continue"/);
    assert.match(landing, /"reg\.specialWarningContinue": "None apply — continue"/);
    assert.match(landing, /"reg\.specialWarningTitle": "தொடர்வதற்கு முன்"/);
    assert.match(landing, /"reg\.specialWarningEdit": "திரும்பிச் சென்று திருத்தவும்"/);
  });
});