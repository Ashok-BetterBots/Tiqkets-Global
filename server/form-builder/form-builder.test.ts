import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import {
  createFormConfig,
  getFirstClientId,
  insertFormSubmission,
  listFormConfigs,
} from "./db";
import { canManageExperimentalClient } from "./routes";
import { ruleMatches, evaluateFieldStates, evaluateSubmitRules } from "./rules";
import { SEEDED_FORM_NAME, SEEDED_FORM_SCHEMA, seedExampleForm } from "./seed";
import type { FormSchema } from "./types";
import { parseFormSchema, validateAnswers } from "./validation";

after(async () => {
  await pool.end();
});

test("the exact example schema is valid and contains the specified date popup", () => {
  const parsed = parseFormSchema(SEEDED_FORM_SCHEMA);
  assert.equal(parsed.fields[0].label, "🎉 Flash early exit will be gifted!");
  assert.deepEqual(parsed.fields[1].options?.map((option) => option.label.en), [
    "Electronics", "Furniture", "Home Appliances", "Vessels",
  ]);
  assert.deepEqual(parsed.fields[2].rules?.[0], {
    trigger: "onChange",
    condition: "not_in",
    compareTo: ["2026-09-15", "2026-09-16"],
    action: "showPopup",
    actionPayload: {
      title: "Date notice",
      message: "This is not a special category date. Standard entry rules apply.",
    },
  });
  assert.equal(parsed.fields[3].options?.length, 4);
  assert.ok(parsed.fields[3].options?.every((option) => Boolean(option.icon)));
});

test("schema validation rejects unknown field properties, duplicates, and optionless choice fields", () => {
  assert.throws(() => parseFormSchema({
    ...SEEDED_FORM_SCHEMA,
    fields: [{ ...SEEDED_FORM_SCHEMA.fields[1], malicious: true }],
  }), /Unrecognized key/);
  assert.throws(() => parseFormSchema({
    ...SEEDED_FORM_SCHEMA,
    fields: [SEEDED_FORM_SCHEMA.fields[1], SEEDED_FORM_SCHEMA.fields[1]],
  }), /Duplicate field ID/);
  assert.throws(() => parseFormSchema({
    version: 1,
    fields: [{ id: "choice", type: "dropdown", label: "Choice", required: false, order: 1 }],
  }), /require options/);
});

test("all reusable field types accept valid values and reject invalid typed answers", () => {
  const schema: FormSchema = {
    version: 1,
    fields: [
      { id: "notice", type: "label", label: "Notice", required: false, order: 1 },
      { id: "short", type: "text", label: "Short", required: true, order: 2 },
      { id: "long", type: "textarea", label: "Long", required: false, order: 3 },
      { id: "drop", type: "dropdown", label: "Drop", required: true, order: 4, options: [{ value: "a", label: "A" }] },
      { id: "radio", type: "radio_icon", label: "Radio", required: true, order: 5, options: [{ value: "a", label: "A", icon: "●" }] },
      { id: "checks", type: "checkbox_icon", label: "Checks", required: true, order: 6, options: [{ value: "a", label: "A", icon: "●" }] },
      { id: "picture", type: "image", label: "Picture", required: true, order: 7, acceptUpload: true },
      { id: "day", type: "date", label: "Day", required: true, order: 8 },
      { id: "clock", type: "time", label: "Time", required: true, order: 9 },
      { id: "phone", type: "phone", label: "Phone", required: true, order: 10 },
      { id: "email", type: "email", label: "Email", required: true, order: 11 },
      { id: "money", type: "currency", label: "Money", required: true, order: 12 },
      { id: "count", type: "number", label: "Count", required: true, order: 13 },
      { id: "yes", type: "toggle", label: "Yes", required: true, order: 14 },
    ],
  };
  const valid = validateAnswers(schema, {
    short: "value", long: "details", drop: "a", radio: "a", checks: ["a"],
    picture: "data:image/png;base64,AA==", day: "2026-09-15", clock: "10:30",
    phone: "+966 500 000 000", email: "guest@example.com", money: "12.50",
    count: 3, yes: true, ignored: "not persisted",
  });
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.answers?.money, 12.5);
  assert.equal(valid.answers?.ignored, undefined);

  const invalid = validateAnswers(schema, {
    short: "", drop: "unknown", radio: "unknown", checks: ["unknown"], picture: 3,
    day: "15/09/2026", clock: "10", phone: "12", email: "bad", money: "NaN", count: {},
  });
  assert.ok(Object.keys(invalid.errors).length >= 12);
});

test("rules cover every condition and enforce submit blocking", () => {
  const answers = { other: "linked", count: 7 };
  assert.equal(ruleMatches({ trigger: "onChange", condition: "equals", compareTo: "other", action: "showField" }, "linked", answers), true);
  assert.equal(ruleMatches({ trigger: "onChange", condition: "not_equals", compareTo: "x", action: "hideField" }, "y", answers), true);
  assert.equal(ruleMatches({ trigger: "onChange", condition: "in", compareTo: ["a", "b"], action: "showPopup" }, "b", answers), true);
  assert.equal(ruleMatches({ trigger: "onChange", condition: "not_in", compareTo: ["a"], action: "showPopup" }, "b", answers), true);
  assert.equal(ruleMatches({ trigger: "onLoad", condition: "is_empty", action: "setRequired" }, "", answers), true);
  assert.equal(ruleMatches({ trigger: "onSubmit", condition: "greater_than", compareTo: 5, action: "blockSubmit" }, 7, answers), true);
  const blocked = evaluateSubmitRules({
    version: 1,
    fields: [{
      id: "count", type: "number", label: "Count", required: false, order: 1,
      rules: [{ trigger: "onSubmit", condition: "greater_than", compareTo: 5, action: "blockSubmit", actionPayload: { message: "Too many" } }],
    }],
  }, answers);
  assert.deepEqual(blocked, { blocked: true, message: "Too many" });
});

test("server validation honors generic visibility and required rules", () => {
  const schema: FormSchema = {
    version: 1,
    fields: [
      {
        id: "switch", type: "toggle", label: "Switch", required: false, order: 1,
        rules: [{
          trigger: "onChange",
          condition: "equals",
          compareTo: false,
          action: "hideField",
          actionPayload: { fieldId: "details" },
        }],
      },
      { id: "details", type: "text", label: "Details", required: true, order: 2 },
    ],
  };
  const answers = { switch: false };
  const result = validateAnswers(schema, answers, evaluateFieldStates(schema, answers));
  assert.deepEqual(result.errors, {});
});

test("field-state rules use browser-equivalent trigger phase precedence", () => {
  const schema: FormSchema = {
    version: 1,
    fields: [
      {
        id: "change_source", type: "toggle", label: "Change", required: false, order: 1,
        rules: [{
          trigger: "onChange", condition: "equals", compareTo: true, action: "showField",
          actionPayload: { fieldId: "target" },
        }],
      },
      {
        id: "load_source", type: "toggle", label: "Load", required: false, order: 2,
        rules: [{
          trigger: "onLoad", condition: "equals", compareTo: true, action: "hideField",
          actionPayload: { fieldId: "target" },
        }],
      },
      { id: "target", type: "text", label: "Target", required: true, order: 3 },
    ],
  };
  const state = evaluateFieldStates(schema, { change_source: true, load_source: true });
  assert.equal(state.hidden.has("target"), false);
});

test("negative conditions do not fire while a field is still empty", () => {
  assert.equal(ruleMatches({
    trigger: "onChange",
    condition: "not_in",
    compareTo: ["2026-09-15"],
    action: "showPopup",
  }, "", {}), false);
  assert.equal(ruleMatches({
    trigger: "onChange",
    condition: "not_equals",
    compareTo: "yes",
    action: "showPopup",
  }, undefined, {}), false);
});

test("client authorization is restricted to platform admins and matching organization owners", () => {
  const base = { userId: "u", permissions: new Set<string>(), role: "owner" } as any;
  assert.equal(canManageExperimentalClient({ ...base, isPlatform: true, isOwner: false, organizationId: null }, "client-a"), true);
  assert.equal(canManageExperimentalClient({ ...base, isPlatform: false, isOwner: true, organizationId: "client-a" }, "client-a"), true);
  assert.equal(canManageExperimentalClient({ ...base, isPlatform: false, isOwner: true, organizationId: "client-b" }, "client-a"), false);
  assert.equal(canManageExperimentalClient({ ...base, isPlatform: false, isOwner: false, organizationId: "client-a" }, "client-a"), false);
});

test("new routes and pages remain under the isolated experimental namespace", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(routes, /\/api\/experimental\/form-builder\/public/);
  assert.match(routes, /\/api\/experimental\/form-builder\/submissions/);
  assert.match(routes, /\/admin\/form-builder/);
  assert.equal((index.match(/registerExperimentalFormRoutes\(app\)/g) || []).length, 1);
});

test("seed is idempotent and submissions persist as JSON for the same client", async () => {
  const clientId = await getFirstClientId();
  if (!clientId) return;
  await seedExampleForm();
  await seedExampleForm();
  const seeded = (await listFormConfigs(clientId)).filter((config) => config.formName === SEEDED_FORM_NAME);
  assert.equal(seeded.length, 1);

  const formName = `Form builder test ${randomUUID()}`;
  const config = await createFormConfig(clientId, formName, SEEDED_FORM_SCHEMA, true);
  try {
    const answers = { product_category: "electronics", preferred_visit_date: "2026-09-15" };
    const submission = await insertFormSubmission(config.id, clientId, config.version, config.schema, answers);
    const result = await pool.query(
      `SELECT client_id, config_version, schema_snapshot, answers
       FROM form_submissions WHERE id = $1`,
      [submission.id],
    );
    assert.equal(result.rows[0].client_id, clientId);
    assert.equal(result.rows[0].config_version, config.version);
    assert.deepEqual(result.rows[0].schema_snapshot, config.schema);
    assert.deepEqual(result.rows[0].answers, answers);
  } finally {
    await pool.query(`DELETE FROM form_submissions WHERE form_config_id = $1`, [config.id]);
    await pool.query(`DELETE FROM form_configs WHERE id = $1`, [config.id]);
  }
});