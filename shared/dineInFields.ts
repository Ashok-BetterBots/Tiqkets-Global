// Default custom fields for Dine-In mode services.
//
// When a service is in Dine-In mode it automatically gets a set of well-known
// fields (Guests / Gender / Split group / Share table). They are stored as
// regular `inputFields` entries (so the customer join form, ticket formData and
// the dashboard queue cards keep working with no special casing), but they use
// fixed `id`s so we can recognise, toggle and reseed them reliably.
//
// IMPORTANT: the web dashboard (server/templates/dashboard.html) is a static
// Alpine page that cannot import this module at runtime, so it inlines an
// equivalent copy of these constants. Keep the two in sync.

export interface DineInInputField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox" | "date";
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

// Well-known ids for the default dine-in fields.
export const DINE_IN_FIELD_IDS = {
  guests: "partySize",
  gender: "gender",
  splitGroup: "splitGroup",
  shareTable: "shareTable",
} as const;

export const DINE_IN_GUESTS_MIN = 1;
export const DINE_IN_GUESTS_MAX = 20;
export const DINE_IN_GENDER_OPTIONS = ["Men only", "Women only", "Men & Women"];

// Max number of extra (user-defined) fields allowed on a dine-in service, on
// top of the four defaults.
export const MAX_DINE_IN_CUSTOM_FIELDS = 3;

const DEFAULT_FIELD_IDS: string[] = [
  DINE_IN_FIELD_IDS.guests,
  DINE_IN_FIELD_IDS.gender,
  DINE_IN_FIELD_IDS.splitGroup,
  DINE_IN_FIELD_IDS.shareTable,
];

export function isDineInDefaultFieldId(id: string = ""): boolean {
  return DEFAULT_FIELD_IDS.includes(id);
}

// Whether a queueMode string represents dine-in (handles both spellings).
export function isDineInMode(mode?: string | null): boolean {
  const v = (mode || "").toLowerCase();
  return v === "dinein" || v === "dine_in" || v === "dine-in";
}

// The single Guests field is always present on a dine-in service.
export function buildGuestsField(): DineInInputField {
  return {
    id: DINE_IN_FIELD_IDS.guests,
    label: "Guests",
    type: "number",
    required: true,
    min: DINE_IN_GUESTS_MIN,
    max: DINE_IN_GUESTS_MAX,
  };
}

export function buildGenderField(): DineInInputField {
  return {
    id: DINE_IN_FIELD_IDS.gender,
    label: "Gender",
    type: "select",
    required: true,
    options: [...DINE_IN_GENDER_OPTIONS],
  };
}

export function buildSplitGroupField(): DineInInputField {
  return {
    id: DINE_IN_FIELD_IDS.splitGroup,
    label: "Split group",
    type: "checkbox",
    required: false,
  };
}

export function buildShareTableField(): DineInInputField {
  return {
    id: DINE_IN_FIELD_IDS.shareTable,
    label: "Share table with others",
    type: "checkbox",
    required: false,
  };
}

// The full set of default dine-in fields (all enabled). Guests first.
export function buildDefaultDineInFields(): DineInInputField[] {
  return [
    buildGuestsField(),
    buildGenderField(),
    buildSplitGroupField(),
    buildShareTableField(),
  ];
}

// Seed the default dine-in fields into an existing inputFields array if NONE of
// the dine-in defaults are present yet (i.e. the first switch to dine-in). The
// guard prevents reseeding fields the admin intentionally disabled later.
export function seedDineInFields<T extends { id: string }>(
  existing: T[] | undefined | null,
): (T | DineInInputField)[] {
  const fields = Array.isArray(existing) ? [...existing] : [];
  if (fields.some((f) => isDineInDefaultFieldId(f.id))) return fields;
  return [...buildDefaultDineInFields(), ...fields];
}
