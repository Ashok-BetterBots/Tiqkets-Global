import type { Express, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import {
  createFormConfig,
  getFormConfig,
  insertFormSubmission,
  listFormClients,
  listFormConfigs,
  updateFormConfig,
} from "./db";
import { seedExampleForm } from "./seed";
import { evaluateFieldStates, evaluateSubmitRules } from "./rules";
import { parseFormSchema, validateAnswers } from "./validation";
import { getCallerContext } from "../rbac";

const templatesDir = path.resolve(process.cwd(), "server", "templates");
const browserDir = path.resolve(process.cwd(), "server", "form-builder", "browser");

type ExperimentalFormCaller = NonNullable<Awaited<ReturnType<typeof getCallerContext>>>;

export function canManageExperimentalClient(caller: ExperimentalFormCaller, clientId: string): boolean {
  return caller.isPlatform || (caller.isOwner && caller.organizationId === clientId);
}

function sendTemplate(fileName: string, res: Response): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(templatesDir, fileName));
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

async function requireFormAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const caller = await getCallerContext(req);
  if (!caller) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!caller.isPlatform && !caller.isOwner) {
    res.status(403).json({ error: "Only organization admins can manage experimental forms" });
    return;
  }
  (req as Request & { formCaller?: typeof caller }).formCaller = caller;
  next();
}

async function assertClientAccess(req: Request, res: Response, clientId: string): Promise<boolean> {
  const caller = (req as Request & { formCaller?: Awaited<ReturnType<typeof getCallerContext>> }).formCaller
    || await getCallerContext(req);
  if (!caller) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (!canManageExperimentalClient(caller, clientId)) {
    res.status(403).json({ error: "Client access denied" });
    return false;
  }
  return true;
}

function safeFormResponse(config: Awaited<ReturnType<typeof getFormConfig>>) {
  if (!config) return null;
  return {
    id: config.id,
    clientId: config.clientId,
    formName: config.formName,
    schema: config.schema,
    isActive: config.isActive,
    version: config.version,
  };
}

export async function registerExperimentalFormRoutes(app: Express): Promise<void> {
  app.get("/admin/form-builder", (_req, res) => sendTemplate("experimental-form-builder.html", res));
  app.get("/experimental/forms/:formId", (_req, res) => sendTemplate("experimental-form-preview.html", res));

  app.get("/experimental/form-builder/assets/:asset", (req, res) => {
    const asset = req.params.asset;
    if (!/^[a-z0-9-]+\.(?:js|css)$/.test(asset)) {
      return res.status(404).send("Not found");
    }
    return res.sendFile(path.join(browserDir, asset));
  });

  app.get("/api/experimental/form-builder/clients", requireFormAdmin, async (req, res) => {
    try {
      const caller = (req as Request & { formCaller?: Awaited<ReturnType<typeof getCallerContext>> }).formCaller;
      const clients = await listFormClients(caller?.isPlatform ? "*" : caller?.organizationId || "");
      res.json({ clients });
    } catch (error) {
      console.error("[form-builder] list clients failed:", error);
      res.status(500).json({ error: "Unable to load clients" });
    }
  });

  app.get("/api/experimental/form-builder/configs", requireFormAdmin, async (req, res) => {
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
    if (!clientId || !await assertClientAccess(req, res, clientId)) return;
    try {
      res.json({ configs: await listFormConfigs(clientId).then((configs) => configs.map(safeFormResponse)) });
    } catch (error) {
      console.error("[form-builder] list configs failed:", error);
      res.status(500).json({ error: "Unable to load form configurations" });
    }
  });

  app.get("/api/experimental/form-builder/configs/:formId", requireFormAdmin, async (req, res) => {
    try {
      const config = await getFormConfig(routeParam(req, "formId"));
      if (!config) return res.status(404).json({ error: "Form configuration not found" });
      if (!await assertClientAccess(req, res, config.clientId)) return;
      res.json({ config: safeFormResponse(config) });
    } catch (error) {
      console.error("[form-builder] get config failed:", error);
      res.status(500).json({ error: "Unable to load form configuration" });
    }
  });

  app.post("/api/experimental/form-builder/configs", requireFormAdmin, async (req, res) => {
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
    const formName = typeof req.body?.formName === "string" ? req.body.formName.trim() : "";
    if (!clientId || !await assertClientAccess(req, res, clientId)) return;
    if (!formName || formName.length > 160) return res.status(400).json({ error: "A form name of 1-160 characters is required" });
    try {
      const schema = parseFormSchema(req.body?.schema);
      const config = await createFormConfig(clientId, formName, schema, req.body?.isActive === true);
      res.status(201).json({ config: safeFormResponse(config) });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "A form with this name already exists for this client" });
      if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid form schema", details: error.issues });
      console.error("[form-builder] create config failed:", error);
      res.status(500).json({ error: "Unable to save form configuration" });
    }
  });

  app.put("/api/experimental/form-builder/configs/:formId", requireFormAdmin, async (req, res) => {
    try {
      const formId = routeParam(req, "formId");
      const current = await getFormConfig(formId);
      if (!current) return res.status(404).json({ error: "Form configuration not found" });
      if (!await assertClientAccess(req, res, current.clientId)) return;
      const formName = typeof req.body?.formName === "string" ? req.body.formName.trim() : "";
      if (!formName || formName.length > 160) return res.status(400).json({ error: "A form name of 1-160 characters is required" });
      const schema = parseFormSchema(req.body?.schema);
      const config = await updateFormConfig(formId, formName, schema, req.body?.isActive === true);
      res.json({ config: safeFormResponse(config) });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid form schema", details: error.issues });
      if (error?.code === "23505") return res.status(409).json({ error: "A form with this name already exists for this client" });
      console.error("[form-builder] update config failed:", error);
      res.status(500).json({ error: "Unable to update form configuration" });
    }
  });

  app.get("/api/experimental/form-builder/public/:formId", async (req, res) => {
    try {
      const config = await getFormConfig(routeParam(req, "formId"), true);
      if (!config) return res.status(404).json({ error: "Active form not found" });
      res.json({ form: safeFormResponse(config) });
    } catch (error) {
      console.error("[form-builder] public form failed:", error);
      res.status(500).json({ error: "Unable to load form" });
    }
  });

  app.post("/api/experimental/form-builder/submissions/:formId", async (req, res) => {
    try {
      const config = await getFormConfig(routeParam(req, "formId"), true);
      if (!config) return res.status(404).json({ error: "Active form not found" });
      const rawAnswers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
      const checked = validateAnswers(config.schema, rawAnswers, evaluateFieldStates(config.schema, rawAnswers));
      if (Object.keys(checked.errors).length > 0) {
        return res.status(422).json({ error: "Please correct the highlighted fields", fields: checked.errors });
      }
      const submitRules = evaluateSubmitRules(config.schema, checked.answers || {});
      if (submitRules.blocked) return res.status(422).json({ error: submitRules.message || "Submission blocked by form rules" });
      const submission = await insertFormSubmission(
        config.id,
        config.clientId,
        config.version,
        config.schema,
        checked.answers || {},
      );
      res.status(201).json({
        success: true,
        submissionId: submission.id,
        message: config.schema.settings?.successMessage || "Registration submitted successfully.",
      });
    } catch (error) {
      console.error("[form-builder] submit failed:", error);
      res.status(500).json({ error: "Unable to submit form" });
    }
  });

  try {
    await seedExampleForm();
  } catch (error) {
    console.error("[form-builder] seed skipped:", error);
  }
}