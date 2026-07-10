import { Logger } from '../_logger';

export async function runRetentionMigration(db: D1Database): Promise<void> {
  Logger.info("Iniciando migração incremental 0003 (Retenção e Exclusão de Evidências)...");

  // Add finalizada_em to avaliacoes
  try {
    await db.prepare(`ALTER TABLE avaliacoes ADD COLUMN finalizada_em TEXT`).run();
    Logger.info("Coluna finalizada_em adicionada à tabela avaliacoes.");
  } catch (err: any) {
    if (err.message && (err.message.includes("duplicate column name") || err.message.includes("already exists"))) {
      // Column already exists
    } else {
      Logger.error(`Erro ao adicionar finalizada_em à tabela avaliacoes: ${err.message || err}`);
    }
  }

  // Add retention columns to ia_evidencias
  const iaColumns = [
    { name: 'retencao_ate', type: 'TEXT' },
    { name: 'arquivo_excluido', type: 'INTEGER DEFAULT 0' },
    { name: 'arquivo_excluido_em', type: 'TEXT' },
    { name: 'arquivo_exclusao_motivo', type: 'TEXT' },
    { name: 'r2_deleted', type: 'INTEGER DEFAULT 0' },
    { name: 'thumbnail_deleted', type: 'INTEGER DEFAULT 0' },
    { name: 'thumbnail_r2_key', type: 'TEXT' },
    { name: 'protected_preview_r2_key', type: 'TEXT' },
    { name: 'risco_lgpd', type: 'INTEGER DEFAULT 0' },
    { name: 'risco_lgpd_tipos_json', type: 'TEXT' },
    { name: 'preview_protegido_gerado', type: 'INTEGER DEFAULT 0' }
  ];

  for (const col of iaColumns) {
    try {
      await db.prepare(`ALTER TABLE ia_evidencias ADD COLUMN ${col.name} ${col.type}`).run();
      Logger.info(`Coluna ${col.name} adicionada à tabela ia_evidencias.`);
    } catch (err: any) {
      if (err.message && (err.message.includes("duplicate column name") || err.message.includes("already exists"))) {
        // Ignore
      } else {
        Logger.error(`Erro ao adicionar ${col.name} à tabela ia_evidencias: ${err.message || err}`);
      }
    }
  }

  // Add retention columns to evidencias
  const evColumns = [
    { name: 'retencao_ate', type: 'TEXT' },
    { name: 'arquivo_excluido', type: 'INTEGER DEFAULT 0' },
    { name: 'arquivo_excluido_em', type: 'TEXT' },
    { name: 'arquivo_exclusao_motivo', type: 'TEXT' },
    { name: 'r2_deleted', type: 'INTEGER DEFAULT 0' },
    { name: 'thumbnail_deleted', type: 'INTEGER DEFAULT 0' },
    { name: 'thumbnail_r2_key', type: 'TEXT' },
    { name: 'protected_preview_r2_key', type: 'TEXT' },
    { name: 'risco_lgpd', type: 'INTEGER DEFAULT 0' },
    { name: 'risco_lgpd_tipos_json', type: 'TEXT' },
    { name: 'preview_protegido_gerado', type: 'INTEGER DEFAULT 0' }
  ];

  for (const col of evColumns) {
    try {
      await db.prepare(`ALTER TABLE evidencias ADD COLUMN ${col.name} ${col.type}`).run();
      Logger.info(`Coluna ${col.name} adicionada à tabela evidencias.`);
    } catch (err: any) {
      if (err.message && (err.message.includes("duplicate column name") || err.message.includes("already exists"))) {
        // Ignore
      } else {
        Logger.error(`Erro ao adicionar ${col.name} à tabela evidencias: ${err.message || err}`);
      }
    }
  }

  // Create portal_lgpd_aceites table
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS portal_lgpd_aceites (
        id TEXT PRIMARY KEY,
        avaliacao_id TEXT NOT NULL,
        tecnico_login_hash TEXT NOT NULL,
        versao_termo TEXT NOT NULL,
        aceite_em TEXT NOT NULL,
        documento_visualizado INTEGER DEFAULT 0,
        documento_baixado INTEGER DEFAULT 0
      )
    `).run();
    Logger.info("Tabela portal_lgpd_aceites criada ou já existente.");
  } catch (err: any) {
    Logger.error(`Erro ao criar tabela portal_lgpd_aceites: ${err.message || err}`);
  }

  // Add index on retencao_ate and arquivo_excluido for querying performance
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_evidencias_retencao ON ia_evidencias(retencao_ate, arquivo_excluido)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_evidencias_retencao ON evidencias(retencao_ate, arquivo_excluido)").run();
    Logger.info("Índices de retenção criados com sucesso.");
  } catch (err: any) {
    Logger.error(`Erro ao criar índices de retenção: ${err.message || err}`);
  }

  Logger.info("Migração incremental 0003 concluída.");
}
