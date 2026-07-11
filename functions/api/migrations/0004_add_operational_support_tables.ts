import { Logger } from '../_logger';

export async function runOperationalSupportMigration(db: D1Database): Promise<void> {
  Logger.info("Iniciando migração incremental 0004 (Tabelas de Suporte Operacional)...");

  // 1. CREATE TABLE app_logs
  try {
    await db.prepare(`
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
      )
    `).run();
    Logger.info("Tabela app_logs criada ou verificada.");
  } catch (err: any) {
    Logger.error(`Erro ao criar tabela app_logs: ${err.message || err}`);
  }

  // Indexes for app_logs
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_app_logs_tipo ON app_logs(tipo)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at)").run();
    Logger.info("Índices para app_logs criados ou verificados.");
  } catch (err: any) {
    Logger.error(`Erro ao criar índices de app_logs: ${err.message || err}`);
  }

  // 2. CREATE TABLE image_ref_counts
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS image_ref_counts (
        image_hash TEXT PRIMARY KEY,
        r2_key TEXT NOT NULL,
        ref_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    Logger.info("Tabela image_ref_counts criada ou verificada.");
  } catch (err: any) {
    Logger.error(`Erro ao criar tabela image_ref_counts: ${err.message || err}`);
  }

  // Indexes for image_ref_counts
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_image_ref_counts_r2_key ON image_ref_counts(r2_key)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_image_ref_counts_last_used_at ON image_ref_counts(last_used_at)").run();
    Logger.info("Índices para image_ref_counts criados ou verificados.");
  } catch (err: any) {
    Logger.error(`Erro ao criar índices de image_ref_counts: ${err.message || err}`);
  }

  // 3. CREATE TABLE ia_analises_logs
  try {
    await db.prepare(`
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
      )
    `).run();
    Logger.info("Tabela ia_analises_logs criada ou verificada.");
  } catch (err: any) {
    Logger.error(`Erro ao criar tabela ia_analises_logs: ${err.message || err}`);
  }

  // Indexes for ia_analises_logs
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_evidencia ON ia_analises_logs(evidencia_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_requested_at ON ia_analises_logs(ia_requested_at)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_analises_logs_requested_by ON ia_analises_logs(ia_requested_by)").run();
    Logger.info("Índices para ia_analises_logs criados ou verificados.");
  } catch (err: any) {
    Logger.error(`Erro ao criar índices de ia_analises_logs: ${err.message || err}`);
  }

  // 4. CREATE TABLE rate_limits
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL
      )
    `).run();
    Logger.info("Tabela rate_limits criada ou verificada.");
  } catch (err: any) {
    Logger.error(`Erro ao criar tabela rate_limits: ${err.message || err}`);
  }

  // Indexes for rate_limits
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON rate_limits(expires_at)").run();
    Logger.info("Índices para rate_limits criados ou verificados.");
  } catch (err: any) {
    Logger.error(`Erro ao criar índice de rate_limits: ${err.message || err}`);
  }

  Logger.info("Migração incremental 0004 concluída com sucesso.");
}
