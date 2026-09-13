import { createFormConfig, getFirstClientId, listFormConfigs } from "./db";
import type { FormSchema } from "./types";

export const SEEDED_FORM_NAME = "Special Category Registration";

export const SEEDED_FORM_SCHEMA: FormSchema = {
  version: 1,
  fields: [
    {
      id: "flash_notice",
      type: "label",
      label: "🎉 Flash early exit will be gifted!",
      required: false,
      order: 10,
    },
    {
      id: "product_category",
      type: "dropdown",
      label: { en: "Product Category", ta: "தயாரிப்பு வகை" },
      required: true,
      order: 20,
      options: [
        { value: "electronics", label: { en: "Electronics", ta: "மின்னணுவியல்" } },
        { value: "furniture", label: { en: "Furniture", ta: "தளபாடங்கள்" } },
        { value: "home_appliances", label: { en: "Home Appliances", ta: "வீட்டு உபகரணங்கள்" } },
        { value: "vessels", label: { en: "Vessels", ta: "பாத்திரங்கள்" } },
      ],
    },
    {
      id: "preferred_visit_date",
      type: "date",
      label: { en: "Preferred Visit Date", ta: "விரும்பிய வருகை தேதி" },
      required: true,
      order: 30,
      rules: [
        {
          trigger: "onChange",
          condition: "not_in",
          compareTo: ["2026-09-15", "2026-09-16"],
          action: "showPopup",
          actionPayload: {
            title: "Date notice",
            message: "This is not a special category date. Standard entry rules apply.",
          },
        },
      ],
    },
    {
      id: "special_category",
      type: "radio_icon",
      label: { en: "Special Category (optional)", ta: "சிறப்பு வகை (விருப்பம்)" },
      required: false,
      order: 40,
      options: [
        { value: "senior_citizen", label: { en: "Senior Citizen", ta: "மூத்த குடிமகன்" }, icon: "🧓" },
        { value: "pregnant_women", label: { en: "Pregnant Women", ta: "கர்ப்பிணிப் பெண்கள்" }, icon: "🤰" },
        { value: "infant", label: { en: "Infant", ta: "குழந்தை" }, icon: "👶" },
        { value: "specially_abled_person", label: { en: "Specially Abled Person", ta: "மாற்றுத்திறனாளி" }, icon: "♿" },
      ],
    },
  ],
  settings: {
    submitLabel: { en: "Submit registration", ta: "பதிவைச் சமர்ப்பிக்கவும்" },
    successMessage: { en: "Registration submitted successfully.", ta: "பதிவு வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது." },
  },
};

export async function seedExampleForm(): Promise<void> {
  const configuredClientId = process.env.EXPERIMENTAL_FORM_CLIENT_ID?.trim();
  if (process.env.NODE_ENV === "production" && !configuredClientId) {
    console.log("[form-builder] production seed skipped; EXPERIMENTAL_FORM_CLIENT_ID is not configured");
    return;
  }
  const clientId = await getFirstClientId(configuredClientId);
  if (!clientId) return;
  const existing = await listFormConfigs(clientId);
  if (existing.some((config) => config.formName === SEEDED_FORM_NAME)) return;
  await createFormConfig(clientId, SEEDED_FORM_NAME, SEEDED_FORM_SCHEMA, true);
  console.log(`[form-builder] seeded "${SEEDED_FORM_NAME}" for client ${clientId}`);
}