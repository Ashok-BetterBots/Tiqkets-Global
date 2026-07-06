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
