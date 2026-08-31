import type { FormRule, FormSchema } from "./types";

function resolveCompareValue(rule: FormRule, answers: Record<string, unknown>): unknown {
  if (typeof rule.compareTo === "string" && Object.prototype.hasOwnProperty.call(answers, rule.compareTo)) {
    return answers[rule.compareTo];
  }
  return rule.compareTo;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value) => right.includes(value));
  }
  return String(left ?? "") === String(right ?? "");
}

export function ruleMatches(rule: FormRule, value: unknown, answers: Record<string, unknown>): boolean {
  const compareTo = resolveCompareValue(rule, answers);
  switch (rule.condition) {
    case "equals": return valuesEqual(value, compareTo);
    case "not_equals": return value !== undefined && value !== null && value !== "" && !valuesEqual(value, compareTo);
    case "in": return Array.isArray(compareTo) && compareTo.some((item) => valuesEqual(value, item));
    case "not_in": return value !== undefined && value !== null && value !== "" &&
      Array.isArray(compareTo) && !compareTo.some((item) => valuesEqual(value, item));
    case "is_empty": return value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
    case "greater_than": return Number(value) > Number(compareTo);
  }
}

export function evaluateSubmitRules(schema: FormSchema, answers: Record<string, unknown>): {
  blocked: boolean;
  message?: string;
} {
  for (const field of schema.fields) {
    for (const rule of field.rules || []) {
      if (rule.trigger !== "onSubmit" || !ruleMatches(rule, answers[field.id], answers)) continue;
      if (rule.action === "blockSubmit") {
        return {
          blocked: true,
          message: rule.actionPayload?.message || "Please review the form before submitting.",
        };
      }
    }
  }
  return { blocked: false };
}

export function evaluateFieldStates(schema: FormSchema, answers: Record<string, unknown>): {
  hidden: Set<string>;
  required: Map<string, boolean>;
} {
  const hidden = new Set<string>();
  const required = new Map<string, boolean>();
  for (const trigger of ["onLoad", "onChange", "onSubmit"] as const) {
    for (const field of schema.fields) {
      for (const rule of field.rules || []) {
        if (rule.trigger !== trigger) continue;
        const active = ruleMatches(rule, answers[field.id], answers);
        const targetId = rule.actionPayload?.fieldId || field.id;
        if (rule.action === "hideField") active ? hidden.add(targetId) : hidden.delete(targetId);
        if (rule.action === "showField") active ? hidden.delete(targetId) : hidden.add(targetId);
        if (rule.action === "setRequired") {
          if (active) required.set(targetId, rule.actionPayload?.required !== false);
          else required.delete(targetId);
        }
      }
    }
  }
  return { hidden, required };
}