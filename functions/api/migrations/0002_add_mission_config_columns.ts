import { Logger } from '../_logger';

export async function runIncrementalMigration(db: D1Database): Promise<void> {
  Logger.info("Iniciando migração incremental 0002 (Configurações de Missões)...");

  // Add columns to missoes_evidencias if they don't exist
  const columnsToAdd = [
    { name: 'permite_camera', type: 'INTEGER DEFAULT 1' },
    { name: 'permite_galeria', type: 'INTEGER DEFAULT 1' },
    { name: 'prompt_ia_especifico', type: 'TEXT' },
    { name: 'created_by', type: 'TEXT' },
    { name: 'updated_by', type: 'TEXT' },
    { name: 'exemplo_correto_r2_key', type: 'TEXT' },
    { name: 'exemplo_incorreto_r2_key', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    try {
      await db.prepare(`ALTER TABLE missoes_evidencias ADD COLUMN ${col.name} ${col.type}`).run();
      Logger.info(`Coluna adicionada: ${col.name}`);
    } catch (err: any) {
      // Ignore if column already exists
      if (err.message && err.message.includes("duplicate column name")) {
        // Coluna já existe
      } else {
        Logger.info(`Aviso ao adicionar coluna ${col.name}: ${err.message || err}`);
      }
    }
  }

  // Create requested indexes
  const indexes = [
    { name: 'idx_missoes_certificacao_id', table: 'missoes_evidencias', column: 'certificacao_id' },
    { name: 'idx_missoes_ativa', table: 'missoes_evidencias', column: 'ativa' },
    { name: 'idx_missoes_ordem', table: 'missoes_evidencias', column: 'ordem' },
    { name: 'idx_missoes_created_at', table: 'missoes_evidencias', column: 'created_at' },
    { name: 'idx_missao_itens_missao_id', table: 'missao_evidencia_itens', column: 'missao_id' },
    { name: 'idx_missao_itens_item_id', table: 'missao_evidencia_itens', column: 'item_id' }
  ];

  for (const idx of indexes) {
    try {
      await db.prepare(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})`).run();
      Logger.info(`Índice criado ou verificado: ${idx.name}`);
    } catch (err: any) {
      Logger.error(`Erro ao criar índice ${idx.name}: ${err.message || err}`);
    }
  }

  Logger.info("Migração incremental 0002 concluída.");
}
