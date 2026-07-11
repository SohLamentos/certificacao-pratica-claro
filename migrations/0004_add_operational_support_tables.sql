-- 0004_add_operational_support_tables.sql
-- Migration to create operational support tables: app_logs, image_ref_counts, ia_analises_logs, rate_limits

CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  evento TEXT NOT NULL,
  usuario_id TEXT,
  perfil TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_logs_tipo
ON app_logs(tipo);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at
ON app_logs(created_at);


CREATE TABLE IF NOT EXISTS image_ref_counts (
  image_hash TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_ref_counts_r2_key
ON image_ref_counts(r2_key);

CREATE INDEX IF NOT EXISTS idx_image_ref_counts_last_used_at
ON image_ref_counts(last_used_at);


CREATE TABLE IF NOT EXISTS ia_analises_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidencia_id TEXT NOT NULL,
  ia_model TEXT,
  ia_prompt_version TEXT,
  ia_requested_by TEXT,
  ia_requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ia_status TEXT,
  ia_tokens_estimated INTEGER,
  ia_result_json TEXT,
  ia_error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_evidencia
ON ia_analises_logs(evidencia_id);

CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_requested_at
ON ia_analises_logs(ia_requested_at);

CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_requested_by
ON ia_analises_logs(ia_requested_by);


CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at
ON rate_limits(expires_at);
