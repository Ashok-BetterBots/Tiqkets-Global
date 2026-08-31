import { pool } from "../db";
import type { FormConfigRecord, FormSchema } from "./types";

type FormConfigRow = {
  id: string;
  client_id: string;
  form_name: string;
  schema: FormSchema;
  is_active: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type FormClientRow = {
  id: string;
  name: string;
  email: string;
};

function mapConfig(row: FormConfigRow): FormConfigRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    formName: row.form_name,
    schema: row.schema,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFormClients(organizationId: string | "*") {
  const result = organizationId === "*"
    ? await pool.query<FormClientRow>(`SELECT id, name, email
       FROM organizations WHERE is_active = true ORDER BY name ASC`)
    : await pool.query<FormClientRow>(`SELECT id, name, email
       FROM organizations WHERE id = $1 AND is_active = true`, [organizationId]);
  return result.rows.map((row: FormClientRow) => ({ id: row.id, name: row.name, email: row.email }));
}

export async function listFormConfigs(clientId: string): Promise<FormConfigRecord[]> {
  const result = await pool.query<FormConfigRow>(
    `SELECT id, client_id, form_name, schema, is_active, version, created_at, updated_at
     FROM form_configs WHERE client_id = $1 ORDER BY updated_at DESC`,
    [clientId],
  );
  return result.rows.map(mapConfig);
}

export async function getFormConfig(id: string, activeOnly = false): Promise<FormConfigRecord | null> {
  const result = await pool.query<FormConfigRow>(
    `SELECT id, client_id, form_name, schema, is_active, version, created_at, updated_at
     FROM form_configs WHERE id = $1 ${activeOnly ? "AND is_active = true" : ""} LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapConfig(result.rows[0]) : null;
}

export async function createFormConfig(clientId: string, formName: string, schema: FormSchema, isActive: boolean) {
  const result = await pool.query<FormConfigRow>(
    `INSERT INTO form_configs (client_id, form_name, schema, is_active)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, client_id, form_name, schema, is_active, version, created_at, updated_at`,
    [clientId, formName, JSON.stringify(schema), isActive],
  );
  return mapConfig(result.rows[0]);
}

export async function updateFormConfig(id: string, formName: string, schema: FormSchema, isActive: boolean) {
  const result = await pool.query<FormConfigRow>(
    `UPDATE form_configs
     SET form_name = $2, schema = $3::jsonb, is_active = $4,
         version = version + 1, updated_at = now()
     WHERE id = $1
     RETURNING id, client_id, form_name, schema, is_active, version, created_at, updated_at`,
    [id, formName, JSON.stringify(schema), isActive],
  );
  return result.rows[0] ? mapConfig(result.rows[0]) : null;
}

export async function insertFormSubmission(
  formConfigId: string,
  clientId: string,
  configVersion: number,
  schemaSnapshot: FormSchema,
  answers: Record<string, unknown>,
) {
  const result = await pool.query(
    `INSERT INTO form_submissions
       (form_config_id, client_id, config_version, schema_snapshot, answers)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, submitted_at`,
    [formConfigId, clientId, configVersion, JSON.stringify(schemaSnapshot), JSON.stringify(answers)],
  );
  return { id: result.rows[0].id as string, submittedAt: result.rows[0].submitted_at };
}

export async function getFirstClientId(preferredId?: string): Promise<string | null> {
  const result = preferredId
    ? await pool.query<{ id: string }>(
      `SELECT id FROM organizations WHERE id = $1 AND is_active = true LIMIT 1`,
      [preferredId],
    )
    : await pool.query<{ id: string }>(
      `SELECT id FROM organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
    );
  return result.rows[0]?.id || null;
}