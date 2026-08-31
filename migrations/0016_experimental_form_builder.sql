CREATE TABLE IF NOT EXISTS form_configs (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar(36) NOT NULL,
  form_name text NOT NULL,
  schema jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT form_configs_client_name_unique UNIQUE (client_id, form_name),
  CONSTRAINT form_configs_id_client_unique UNIQUE (id, client_id)
);

CREATE INDEX IF NOT EXISTS form_configs_client_idx ON form_configs (client_id);
CREATE INDEX IF NOT EXISTS form_configs_active_idx ON form_configs (client_id, is_active);

CREATE TABLE IF NOT EXISTS form_submissions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  form_config_id varchar(36) NOT NULL,
  client_id varchar(36) NOT NULL,
  config_version integer NOT NULL,
  schema_snapshot jsonb NOT NULL,
  answers jsonb NOT NULL,
  submitted_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT form_submissions_config_client_fk
    FOREIGN KEY (form_config_id, client_id)
    REFERENCES form_configs(id, client_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS form_submissions_config_idx ON form_submissions (form_config_id, submitted_at);
CREATE INDEX IF NOT EXISTS form_submissions_client_idx ON form_submissions (client_id, submitted_at);