export interface TableColumn {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string;
}

export interface TableSchema {
  tableName: string;
  columns: TableColumn[];
}

export const DBSchema: TableSchema[] = [
  {
    tableName: 'certificacoes',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'nome', type: 'TEXT', nullable: false },
      { name: 'descricao', type: 'TEXT' },
      { name: 'perfil_permitido', type: 'TEXT', nullable: false },
      { name: 'cor', type: 'TEXT' },
      { name: 'icone', type: 'TEXT' },
      { name: 'ativa', type: 'INTEGER', defaultValue: '1' }
    ]
  },
  {
    tableName: 'grupos',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'nome', type: 'TEXT', nullable: false },
      { name: 'certificacao_id', type: 'INTEGER', nullable: false }
    ]
  },
  {
    tableName: 'itens',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'certificacao_id', type: 'INTEGER', nullable: false },
      { name: 'grupo_id', type: 'INTEGER', nullable: false },
      { name: 'ordem', type: 'INTEGER', nullable: false },
      { name: 'descricao', type: 'TEXT', nullable: false },
      { name: 'critico', type: 'INTEGER', defaultValue: '0' },
      { name: 'obrigatorio', type: 'INTEGER', defaultValue: '1' },
      { name: 'ativo', type: 'INTEGER', defaultValue: '1' }
    ]
  },
  {
    tableName: 'avaliadores',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'nome', type: 'TEXT', nullable: false },
      { name: 'perfil', type: 'TEXT', nullable: false },
      { name: 'cidade', type: 'TEXT' },
      { name: 'base', type: 'TEXT' },
      { name: 'cidade_base', type: 'TEXT' },
      { name: 'ativo', type: 'INTEGER', defaultValue: '1' },
      { name: 'status', type: 'TEXT', defaultValue: "'ATIVO'" },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'tecnicos',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'nome', type: 'TEXT', nullable: false },
      { name: 'matricula', type: 'TEXT', nullable: false },
      { name: 'empresa', type: 'TEXT', nullable: false },
      { name: 'cidade_base', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'avaliacoes',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true },
      { name: 'tecnico_id', type: 'INTEGER' },
      { name: 'nome_tecnico', type: 'TEXT', nullable: false },
      { name: 'matricula', type: 'TEXT', nullable: false },
      { name: 'empresa', type: 'TEXT', nullable: false },
      { name: 'cidade_base', type: 'TEXT', nullable: false },
      { name: 'avaliador_id', type: 'INTEGER' },
      { name: 'nome_cq', type: 'TEXT', nullable: false },
      { name: 'data', type: 'TEXT', nullable: false },
      { name: 'certificacao_id', type: 'INTEGER' },
      { name: 'status', type: 'TEXT', nullable: false },
      { name: 'resultado', type: 'TEXT' },
      { name: 'observacao', type: 'TEXT' },
      { name: 'nota_teorica', type: 'REAL' },
      { name: 'nota_pratica', type: 'REAL' },
      { name: 'modo_certificacao', type: 'TEXT', defaultValue: "'TRADICIONAL'" },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'respostas',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'avaliacao_id', type: 'TEXT', nullable: false },
      { name: 'item_id', type: 'INTEGER', nullable: false },
      { name: 'resposta', type: 'TEXT', nullable: false }
    ]
  },
  {
    tableName: 'ia_evidencias',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true },
      { name: 'certificacao_id', type: 'TEXT', nullable: false },
      { name: 'etapa', type: 'TEXT', nullable: false },
      { name: 'tipo_arquivo', type: 'TEXT', nullable: false },
      { name: 'arquivo_url', type: 'TEXT', nullable: false },
      { name: 'arquivo_key', type: 'TEXT', nullable: false },
      { name: 'status_ia', type: 'TEXT', defaultValue: "'PENDENTE'" },
      { name: 'resultado_ia', type: 'TEXT' },
      { name: 'justificativa_ia', type: 'TEXT' },
      { name: 'confianca_ia', type: 'REAL' },
      { name: 'decisao_cq', type: 'TEXT' },
      { name: 'observacao_cq', type: 'TEXT' },
      { name: 'ia_modelo', type: 'TEXT' },
      { name: 'ia_custo_estimado', type: 'REAL', defaultValue: '0.0' },
      { name: 'ia_hash_arquivo', type: 'TEXT' },
      { name: 'ia_origem', type: 'TEXT', defaultValue: "'AUTOMATICA'" },
      { name: 'imagem_repetida', type: 'INTEGER', defaultValue: '0' },
      { name: 'imagem_repetida_alerta', type: 'TEXT' },
      { name: 'risco_reuso', type: 'TEXT', defaultValue: "'BAIXO'" },
      { name: 'usuario_upload_id', type: 'TEXT' },
      { name: 'perfil_upload', type: 'TEXT' },
      { name: 'login_hash', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'ia_auditoria',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'certificacao_id', type: 'TEXT', nullable: false },
      { name: 'evidencia_id', type: 'TEXT' },
      { name: 'acao', type: 'TEXT', nullable: false },
      { name: 'payload', type: 'TEXT', nullable: false },
      { name: 'usuario_id', type: 'TEXT' },
      { name: 'perfil_usuario', type: 'TEXT' },
      { name: 'login_hash', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', defaultValue: 'CURRENT_TIMESTAMP' }
    ]
  },
  {
    tableName: 'ia_regras_itens',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'tipo_certificacao', type: 'TEXT', nullable: false },
      { name: 'etapa', type: 'TEXT', nullable: false },
      { name: 'regras_texto', type: 'TEXT', nullable: false },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'ia_feedback_treinamento',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'evidencia_id', type: 'TEXT', nullable: false },
      { name: 'etapa', type: 'TEXT', nullable: false },
      { name: 'resultado_esperado', type: 'TEXT', nullable: false },
      { name: 'justificativa_treinamento', type: 'TEXT', nullable: false },
      { name: 'created_at', type: 'TEXT' }
    ]
  },
  {
    tableName: 'ia_lgpd_config',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'nome_chave', type: 'TEXT', nullable: false },
      { name: 'habilitado', type: 'INTEGER', defaultValue: '1' },
      { name: 'descricao', type: 'TEXT' }
    ]
  }
];
