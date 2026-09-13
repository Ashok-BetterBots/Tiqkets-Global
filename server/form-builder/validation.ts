import { z } from "zod";
import { FORM_FIELD_TYPES, type FormSchema } from "./types";

const localizedTextSchema = z.union([
  z.string().trim().min(1).max(500),
  z.object({
    en: z.string().trim().max(500).optional(),
    ta: z.string().trim().max(500).optional(),
  }).refine((value) => Boolean(value.en || value.ta), "At least one label language is required"),
]);

const optionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: localizedTextSchema,
  icon: z.string().trim().max(80).optional(),
}).strict();

const ruleSchema = z.object({
  trigger: z.enum(["onChange", "onSubmit", "onLoad"]),
  condition: z.enum(["equals", "not_equals", "in", "not_in", "is_empty", "greater_than"]),
  compareTo: z.unknown().optional(),
  action: z.enum(["showPopup", "showField", "hideField", "setRequired", "blockSubmit"]),
  actionPayload: z.object({
    title: z.string().trim().max(200).optional(),
    message: z.string().trim().max(1000).optional(),
    fieldId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).optional(),
    required: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const fieldSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, "Field IDs must start with a letter"),
  type: z.enum(FORM_FIELD_TYPES),
  label: localizedTextSchema,
  required: z.boolean(),
  order: z.number().int().min(0).max(10000),
  options: z.array(optionSchema).max(100).optional(),
  icon: z.string().trim().max(80).optional(),
  imageUrl: z.string().trim().max(2000).optional(),
  acceptUpload: z.boolean().optional(),
  rules: z.array(ruleSchema).max(20).optional(),
}).strict().superRefine((field, ctx) => {
  const optionTypes = new Set(["dropdown", "radio_icon", "checkbox_icon"]);
  if (optionTypes.has(field.type) && (!field.options || field.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field.type} fields require options`, path: ["options"] });
  }
  if (field.type === "image" && field.imageUrl && !/^https?:\/\/|^data:image\//i.test(field.imageUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Images must use an https URL or image data URL", path: ["imageUrl"] });
  }
});

export const formSchemaValidator = z.object({
  version: z.literal(1),
  fields: z.array(fieldSchema).min(1).max(100),
  settings: z.object({
    submitLabel: localizedTextSchema.optional(),
    successMessage: localizedTextSchema.optional(),
  }).strict().optional(),
}).strict().superRefine((schema, ctx) => {
  const ids = new Set<string>();
  const optionValues = new Set<string>();
  for (const [index, field] of schema.fields.entries()) {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate field ID: ${field.id}`, path: ["fields", index, "id"] });
    }
    ids.add(field.id);
    for (const option of field.options || []) {
      const key = `${field.id}:${option.value}`;
      if (optionValues.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate option value: ${option.value}`, path: ["fields", index, "options"] });
      }
      optionValues.add(key);
    }
  }
});

export function parseFormSchema(input: unknown): FormSchema {
  return formSchemaValidator.parse(input) as FormSchema;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" ||
    (Array.isArray(value) && value.length === 0);
}

export function validateAnswers(
  schema: FormSchema,
  input: unknown,
  fieldStates?: { hidden?: Set<string>; required?: Map<string, boolean> },
): {
  answers?: Record<string, unknown>;
  errors: Record<string, string>;
} {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const answers: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of [...schema.fields].sort((a, b) => a.order - b.order)) {
    const value = source[field.id];
    if (field.type === "label") continue;
    if (fieldStates?.hidden?.has(field.id)) continue;
    const required = fieldStates?.required?.has(field.id)
      ? fieldStates.required.get(field.id) === true
      : field.required;
    if (isEmpty(value)) {
      if (required) errors[field.id] = "This field is required";
      continue;
    }

    if (["text", "textarea", "phone", "email", "date", "time"].includes(field.type) &&
        (typeof value !== "string" || value.length > 10000)) {
      errors[field.id] = "Enter a valid value";
      continue;
    }
    if (field.type === "email" && (stringValue(value).length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue(value)))) {
      errors[field.id] = "Enter a valid email address";
      continue;
    }
    if (field.type === "phone" && !/^\+?[0-9\s().-]{7,20}$/.test(stringValue(value))) {
      errors[field.id] = "Enter a valid phone number";
      continue;
    }
    if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue(value)) ||
        Number.isNaN(Date.parse(`${stringValue(value)}T00:00:00Z`)))) {
      errors[field.id] = "Enter a valid date";
      continue;
    }
    if (field.type === "time" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(stringValue(value))) {
      errors[field.id] = "Enter a valid time";
      continue;
    }
    if (field.type === "number" || field.type === "currency") {
      const numberValue = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numberValue)) {
        errors[field.id] = "Enter a valid number";
        continue;
      }
      answers[field.id] = numberValue;
      continue;
    }
    if (field.type === "dropdown" || field.type === "radio_icon") {
      if (typeof value !== "string" || !field.options?.some((option) => option.value === value)) {
        errors[field.id] = "Choose one of the available options";
        continue;
      }
    }
    if (field.type === "checkbox_icon") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string") ||
        value.some((item) => !field.options?.some((option) => option.value === item))) {
        errors[field.id] = "Choose valid options";
        continue;
      }
    }
    if (field.type === "image" && (typeof value !== "string" || value.length > 1700000 ||
        !/^https?:\/\/|^data:image\//i.test(value))) {
      errors[field.id] = "Choose a valid image";
      continue;
    }
    if (field.type === "toggle" && typeof value !== "boolean") {
      errors[field.id] = "Choose yes or no";
      continue;
    }
    if ((field.type === "text" || field.type === "textarea") && typeof value !== "string") {
      errors[field.id] = "Enter a valid value";
      continue;
    }
    answers[field.id] = value;
  }

  return { answers: Object.keys(errors).length ? undefined : answers, errors };
}