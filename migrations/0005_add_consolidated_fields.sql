-- 0005_add_consolidated_fields.sql
-- Migration to support consolidated AI analysis in avaliacoes and ia_analises_logs

-- Add consolidated analysis columns to avaliacoes
ALTER TABLE avaliacoes ADD COLUMN ia_status_consolidado TEXT DEFAULT 'NAO_SOLICITADA';
ALTER TABLE avaliacoes ADD COLUMN ia_fingerprint_consolidada TEXT;
ALTER TABLE avaliacoes ADD COLUMN ia_resultado_consolidado_json TEXT;
ALTER TABLE avaliacoes ADD COLUMN ia_reanalise_pendente INTEGER DEFAULT 0;

-- Add helper columns to ia_analises_logs
ALTER TABLE ia_analises_logs ADD COLUMN tipo_analise TEXT;
ALTER TABLE ia_analises_logs ADD COLUMN analysis_fingerprint TEXT;
ALTER TABLE ia_analises_logs ADD COLUMN knowledge_version TEXT;
ALTER TABLE ia_analises_logs ADD COLUMN tempo_processamento_ms INTEGER;
ALTER TABLE ia_analises_logs ADD COLUMN reaproveitada INTEGER DEFAULT 0;
ALTER TABLE ia_analises_logs ADD COLUMN economia_estimada REAL DEFAULT 0.0;
