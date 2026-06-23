// Default custom fields for Takeaway mode services.
//
// When a service is in Takeaway mode it automatically gets an "Order ID"
// text field. It is stored as a regular `inputFields` entry but uses a
// fixed `id` so it can be recognised, protected from deletion and reseeded
// reliably.
//
// IMPORTANT: the web dashboard (server/templates/dashboard.html) is a static
// Alpine page that cannot import this module at runtime, so it inlines an
// equivalent copy of these constants. Keep the two in sync.

export interface TakeawayInputField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox" | "date";
  required: boolean;
  options?: string[];
}

// Well-known id for the default takeaway Order ID field.
export const TAKEAWAY_FIELD_IDS = {
  orderId: "orderId",
} as const;

// Max number of extra (user-defined) fields allowed on a takeaway service,
// on top of the one default Order ID field.
export const MAX_TAKEAWAY_CUSTOM_FIELDS = 3;

const DEFAULT_TAKEAWAY_FIELD_IDS: string[] = [TAKEAWAY_FIELD_IDS.orderId];

export function isTakeawayDefaultFieldId(id: string = ""): boolean {
  return DEFAULT_TAKEAWAY_FIELD_IDS.includes(id);
}

// Whether a queueMode string represents takeaway.
export function isTakeawayMode(mode?: string | null): boolean {
  return (mode || "").toLowerCase() === "takeaway";
}

// The always-on Order ID field.
export function buildOrderIdField(): TakeawayInputField {
  return {
    id: TAKEAWAY_FIELD_IDS.orderId,
    label: "Order ID",
    type: "text",
    required: true,
  };
}

// Seed the default takeaway Order ID field into an existing inputFields array
// if it is not already present. No-ops if already seeded so re-opening an
// existing service does not duplicate the field.
export function seedTakeawayFields<T extends { id: string }>(
  existing: T[] | undefined | null,
): (T | TakeawayInputField)[] {
  const fields = Array.isArray(existing) ? [...existing] : [];
  if (fields.some((f) => f.id === TAKEAWAY_FIELD_IDS.orderId)) return fields;
  return [buildOrderIdField(), ...fields];
}
