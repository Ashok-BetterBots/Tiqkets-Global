// ============================================
// Approved WhatsApp Business templates (Meta-reviewed) that replace the
// free-form message pipeline for specific (mode, trigger, language) tuples.
//
// Free-form text/image messages (see server/whatsapp.ts sendWhatsAppMessage /
// sendWhatsAppImage) only deliver within Meta's 24-hour customer-service
// window. Pre-approved templates can be sent anytime, so triggers that have
// an approved template registered here are sent via the WhatsApp Cloud API
// `type: "template"` call instead — with the org's live data mapped onto the
// template's positional {{1}}..{{N}} body placeholders, and (when the
// template was built with an image header) the generated Tiqket image
// attached as the header media.
//
// Add one entry per (mode, trigger, language) as templates are approved.
// Anything not listed here keeps using the existing free-form pipeline, so
// partial rollout (e.g. only the `ticket` trigger, only `en`/`ta`) is safe.
// ============================================

export interface WaApprovedTemplate {
  // Exact template name as registered in Meta Business Manager.
  templateName: string;
  // Meta template language code (e.g. "en", "ta") — must match what the
  // template was submitted/approved under, not our internal language code.
  languageCode: string;
  // True when the template's header component is an IMAGE placeholder.
  // When true, the generated Tiqket (QR boarding-pass) image is sent as the
  // header media automatically — no caption text is needed since the body
  // component carries all the text.
  hasImageHeader: boolean;
  // Ordered list of our internal variable names (see WA_VARIABLES in
  // shared/wa-templates.ts) mapped onto the template's {{1}}, {{2}}, ...
  // body placeholders, in order.
  bodyVariables: string[];
  // Set for "Utility · Flows" templates (WhatsApp Flow button). Meta's API
  // requires a buttons component with sub_type "flow" and a flow_token even
  // when the token is static. Use "unused" for flows with no server-side data.
  flowToken?: string;
  // True when the template has a CTA URL button whose suffix/URL is dynamic.
  // When true, sendWhatsAppTemplateMessage receives the full ticket URL as
  // ctaUrlParam and sends it as a buttons component (sub_type: "url").
  hasCTAUrl?: boolean;
}

// Key: `${mode}|${trigger}|${internalLanguageCode}` — internalLanguageCode
// matches shared/languages.ts codes (e.g. "en", "ta"), NOT necessarily the
// Meta languageCode stored on the template itself.
export const WA_APPROVED_TEMPLATES: Record<string, WaApprovedTemplate> = {
  "events|ticket|en": {
    templateName: "tiqket_global_event_reservation_success_english",
    languageCode: "en",
    hasImageHeader: true,
    bodyVariables: [
      "customer_name",
      "booking_id",
      "event_name",
      "slot_date",
      "slot_time",
      "venue",
      "family_count",
      "amount_paid",
    ],
  },
  "events|ticket|ta": {
    templateName: "tiqkets_global_event_reservation_success_tamil",
    languageCode: "ta",
    hasImageHeader: true,
    bodyVariables: [
      "customer_name",
      "booking_id",
      "event_name",
      "slot_date",
      "slot_time",
      "venue",
      "family_count",
      "amount_paid",
    ],
  },
  "events|reminder_day|en": {
    templateName: "tiqkets_global_event_reminder_24hr_english",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: [
      "customer_name",
      "event_name",
      "slot_date",
      "slot_time",
      "venue",
      "booking_id",
    ],
  },
  "events|reminder_day|ta": {
    templateName: "tiqkets_global_event_reminder_24hr_tamil",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: [
      "customer_name",
      "event_name",
      "slot_date",
      "slot_time",
      "venue",
      "booking_id",
    ],
  },
  "events|reminder_hour|en": {
    templateName: "tiqkets_global_event_reminder_30min_english",
    languageCode: "en",
    hasImageHeader: true,
    bodyVariables: [
      "customer_name",
      "event_name",
      "slot_date",
      "slot_time",
      "booking_id",
    ],
  },
  "events|reminder_hour|ta": {
    templateName: "tiqkets_global_event_reminder_30min_tamil",
    languageCode: "ta",
    hasImageHeader: true,
    bodyVariables: [
      "customer_name",
      "event_name",
      "slot_date",
      "slot_time",
      "booking_id",
    ],
  },
  "events|checked_in|en": {
    templateName: "tiqkets_global_event_checkin_success_english",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "booking_id"],
  },
  "events|checked_in|ta": {
    templateName: "tiqkets_global_event_checkin_success_tamil",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "booking_id"],
  },
  "events|billing_otp|en": {
    templateName: "tiqkets_global_event_billing_otp_english",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["otp_code", "otp_purpose", "otp_validity", "support_contact"],
  },
  "events|billing|en": {
    templateName: "tiqkets_global_event_advance_redeemed_english",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "advance_redeemed", "booking_id"],
  },
  "events|billing|ta": {
    templateName: "tiqkets_global_event_advance_redeemed_tamil",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "advance_redeemed", "booking_id"],
  },
  // Flow-type template (Meta "Utility · Flows" category) — the "Provide
  // Rating" button opens a native WhatsApp Flow. Meta's Cloud API requires a
  // buttons component (sub_type: "flow") even for static/no-context flows;
  // flow_token "unused" is the Meta-recommended value when no server data is
  // needed inside the flow.
  "events|thank_you_feedback|en": {
    templateName: "tiqkets_global_event_feedback_request_english",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "event_name"],
    flowToken: "unused",
  },

  // ── Dine-In: Booking Confirmed (walk-in join / immediate booking) ──────────
  // Sent right after a customer registers via QR scan. Has an image header
  // (the generated ticket card) and a CTA URL button (live ticket link).
  "dinein|booking_confirmed|en": {
    templateName: "tiqkets_global_dinein_booking_confirmed_english",
    languageCode: "en",
    hasImageHeader: true,
    hasCTAUrl: true,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id", "guest_count", "reservation_time"],
  },
  "dinein|booking_confirmed|ta": {
    templateName: "tiqkets_global_dinein_booking_confirmed_ta",
    languageCode: "ta",
    hasImageHeader: true,
    hasCTAUrl: true,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id", "guest_count", "reservation_time"],
  },

  // ── Dine-In: Table Ready (customer called to table) ───────────────────────
  "dinein|table_ready|en": {
    templateName: "tiqkets_global_dinein_table_ready_en",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "table_no", "guest_count", "booking_id"],
  },
  "dinein|table_ready|ta": {
    templateName: "tiqkets_global_dinein_table_ready_ta",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "table_no", "guest_count", "booking_id"],
  },

  // ── Dine-In: Booking Reminder (re-call / reminder for waiting customers) ──
  "dinein|booking_reminder|en": {
    templateName: "tiqkets_global_dinein_booking_reminder_en",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "table_no", "guest_count", "reservation_time", "booking_id"],
  },
  "dinein|booking_reminder|ta": {
    templateName: "tiqkets_global_dinein_booking_reminder_ta",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "table_no", "guest_count", "reservation_time", "booking_id"],
  },

  // ── Dine-In: Booking on Hold ──────────────────────────────────────────────
  // Variable ORDER differs between EN and TA — defined per entry.
  "dinein|booking_on_hold|en": {
    templateName: "tiqkets_global_dinein_booking_on_hold_en",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "booking_id", "restaurant_name", "branch_name"],
  },
  "dinein|booking_on_hold|ta": {
    templateName: "tiqkets_global_dinein_booking_on_hold_ta",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id"],
  },

  // ── Dine-In: Reservation Confirmed (advance/pre-booking confirmation) ──────
  "dinein|reservation_confirmed|en": {
    templateName: "tiqkets_global_dinein_reservation_confirmed_en",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id", "guest_count", "reservation_time"],
  },
  "dinein|reservation_confirmed|ta": {
    templateName: "tiqkets_global_dinein_reservation_confirmed_ta",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id", "guest_count", "reservation_time"],
  },

  // ── Dine-In: Booking Resumed (un-hold / resumed from hold) ───────────────
  // Variable ORDER differs between EN and TA.
  "dinein|booking_resumed|en": {
    templateName: "tiqkets_global_dinein_booking_resumed_en",
    languageCode: "en",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "booking_id", "restaurant_name", "branch_name", "guest_count", "reservation_time"],
  },
  "dinein|booking_resumed|ta": {
    templateName: "tiqkets_global_dinein_booking_resumed_ta",
    languageCode: "ta",
    hasImageHeader: false,
    bodyVariables: ["customer_name", "restaurant_name", "branch_name", "booking_id", "guest_count", "reservation_time"],
  },
};

// Look up the approved template for (mode, trigger, language). Falls back to
// the English entry for the same (mode, trigger) when the requested language
// has no approved template registered yet, and returns null when neither
// exists (caller should fall back to the free-form pipeline).
export function getApprovedWaTemplate(
  mode: string,
  trigger: string,
  language: string | null | undefined,
): WaApprovedTemplate | null {
  const lang = (language || "en").toLowerCase();
  const direct = WA_APPROVED_TEMPLATES[`${mode}|${trigger}|${lang}`];
  if (direct) return direct;
  if (lang !== "en") {
    const english = WA_APPROVED_TEMPLATES[`${mode}|${trigger}|en`];
    if (english) return english;
  }
  return null;
}
