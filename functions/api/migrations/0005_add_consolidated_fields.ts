import { Logger } from '../_logger';

export async function runConsolidatedFieldsMigration(db: D1Database): Promise<void> {
  Logger.info("Iniciando migração incremental 0005 (Campos de Análise Consolidada)...");

  // 1. Add columns to 'avaliacoes'
  const avaliacoesColumns = [
    { name: 'ia_status_consolidado', type: "TEXT DEFAULT 'NAO_SOLICITADA'" },
    { name: 'ia_fingerprint_consolidada', type: "TEXT" },
    { name: 'ia_resultado_consolidado_json', type: "TEXT" },
    { name: 'ia_reanalise_pendente', type: "INTEGER DEFAULT 0" }
  ];

  for (const col of avaliacoesColumns) {
    try {
      await db.prepare(`ALTER TABLE avaliacoes ADD COLUMN ${col.name} ${col.type}`).run();
      Logger.info(`Coluna '${col.name}' adicionada à tabela avaliacoes.`);
    } catch (err: any) {
      if (err.message && (err.message.includes("duplicate column name") || err.message.includes("already exists"))) {
        // Ignorar se já existe
      } else {
        Logger.error(`Erro ao adicionar coluna '${col.name}' à tabela avaliacoes: ${err.message || err}`);
      }
    }
  }

  // 2. Add columns to 'ia_analises_logs'
  const logsColumns = [
    { name: 'tipo_analise', type: "TEXT" },
    { name: 'analysis_fingerprint', type: "TEXT" },
    { name: 'knowledge_version', type: "TEXT" },
    { name: 'tempo_processamento_ms', type: "INTEGER" },
    { name: 'reaproveitada', type: "INTEGER DEFAULT 0" },
    { name: 'economia_estimada', type: "REAL DEFAULT 0.0" }
  ];

  for (const col of logsColumns) {
    try {
      await db.prepare(`ALTER TABLE ia_analises_logs ADD COLUMN ${col.name} ${col.type}`).run();
      Logger.info(`Coluna '${col.name}' adicionada à tabela ia_analises_logs.`);
    } catch (err: any) {
      if (err.message && (err.message.includes("duplicate column name") || err.message.includes("already exists"))) {
        // Ignorar se já existe
      } else {
        Logger.error(`Erro ao adicionar coluna '${col.name}' à tabela ia_analises_logs: ${err.message || err}`);
      }
    }
  }

  Logger.info("Migração incremental 0005 concluída.");
}
