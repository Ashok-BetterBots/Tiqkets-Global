export const FORM_FIELD_TYPES = [
  "label",
  "text",
  "textarea",
  "dropdown",
  "radio_icon",
  "checkbox_icon",
  "image",
  "date",
  "time",
  "phone",
  "email",
  "currency",
  "number",
  "toggle",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export type LocalizedText = string | { en?: string; ta?: string };

export interface FormOption {
  value: string;
  label: LocalizedText;
  icon?: string;
}

export type RuleTrigger = "onChange" | "onSubmit" | "onLoad";
export type RuleCondition =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_empty"
  | "greater_than";
export type RuleAction =
  | "showPopup"
  | "showField"
  | "hideField"
  | "setRequired"
  | "blockSubmit";

export interface FormRule {
  trigger: RuleTrigger;
  condition: RuleCondition;
  compareTo?: unknown;
  action: RuleAction;
  actionPayload?: {
    title?: string;
    message?: string;
    fieldId?: string;
    required?: boolean;
  };
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: LocalizedText;
  required: boolean;
  order: number;
  options?: FormOption[];
  icon?: string;
  imageUrl?: string;
  acceptUpload?: boolean;
  rules?: FormRule[];
}

export interface FormSchema {
  version: 1;
  fields: FormField[];
  settings?: {
    submitLabel?: LocalizedText;
    successMessage?: LocalizedText;
  };
}

export interface FormConfigRecord {
  id: string;
  clientId: string;
  formName: string;
  schema: FormSchema;
  isActive: boolean;
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}