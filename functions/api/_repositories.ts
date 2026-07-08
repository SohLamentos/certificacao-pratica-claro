import { Logger } from './_logger';

export class EvaluationRepository {
  static async getById(db: D1Database, id: string): Promise<any> {
    return await db.prepare(`
      SELECT a.*, c.nome as certificacao_nome
      FROM avaliacoes a
      LEFT JOIN certificacoes c ON a.certificacao_id = c.id
      WHERE a.id = ?
    `).bind(id).first();
  }

  static async getChecklistResponses(db: D1Database, evalId: string): Promise<any[]> {
    const { results } = await db.prepare(
      "SELECT * FROM respostas WHERE avaliacao_id = ?"
    ).bind(evalId).all();
    return results || [];
  }

  static async delete(db: D1Database, id: string): Promise<void> {
    await db.prepare("DELETE FROM avaliacoes WHERE id = ?").bind(id).run();
    await db.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(id).run();
    Logger.info(`Avaliação excluída: ${id}`);
  }

  static async create(db: D1Database, data: any): Promise<void> {
    await db.prepare(`
      INSERT INTO avaliacoes (
        id, tecnico_id, nome_tecnico, matricula, empresa, cidade_base, 
        avaliador_id, nome_cq, data, certificacao_id, status, resultado, 
        observacao, nota_teorica, nota_pratica, modo_certificacao, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      data.id,
      data.tecnico_id || null,
      data.nome_tecnico || data.nomeTecnico,
      data.matricula,
      data.empresa,
      data.cidade_base || data.cidadeBase,
      data.avaliador_id || null,
      data.nome_cq || data.nomeCQ,
      data.data,
      data.certificacao_id,
      data.status,
      data.resultado ? JSON.stringify(data.resultado) : null,
      data.observacao || '',
      data.nota_teorica !== undefined && data.nota_teorica !== null ? Number(data.nota_teorica) : null,
      data.nota_pratica !== undefined && data.nota_pratica !== null ? Number(data.nota_pratica) : null,
      data.modo_certificacao || 'TRADICIONAL'
    ).run();
    Logger.info(`Avaliação criada: ${data.id}`);
  }

  static async update(db: D1Database, id: string, data: any): Promise<void> {
    await db.prepare(`
      UPDATE avaliacoes SET 
        tecnico_id = ?, nome_tecnico = ?, matricula = ?, empresa = ?, cidade_base = ?, 
        avaliador_id = ?, nome_cq = ?, data = ?, certificacao_id = ?, status = ?, 
        resultado = ?, observacao = ?, nota_teorica = ?, nota_pratica = ?, modo_certificacao = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(
      data.tecnico_id || null,
      data.nome_tecnico || data.nomeTecnico,
      data.matricula,
      data.empresa,
      data.cidade_base || data.cidadeBase,
      data.avaliador_id || null,
      data.nome_cq || data.nomeCQ,
      data.data,
      data.certificacao_id,
      data.status,
      data.resultado ? JSON.stringify(data.resultado) : null,
      data.observacao || '',
      data.nota_teorica !== undefined && data.nota_teorica !== null ? Number(data.nota_teorica) : null,
      data.nota_pratica !== undefined && data.nota_pratica !== null ? Number(data.nota_pratica) : null,
      data.modo_certificacao || 'TRADICIONAL',
      id
    ).run();
    Logger.info(`Avaliação atualizada: ${id}`);
  }

  static async syncResponses(db: D1Database, evalId: string, responses: Record<number, string>): Promise<void> {
    await db.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(evalId).run();
    if (responses) {
      for (const [itemIdStr, resVal] of Object.entries(responses)) {
        const itemId = parseInt(itemIdStr, 10);
        await db.prepare(
          "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
        ).bind(evalId, itemId, resVal).run();
      }
    }
  }
}

export class EvidenceRepository {
  static async getByCertId(db: D1Database, certId: string): Promise<any[]> {
    const { results } = await db.prepare(
      "SELECT * FROM ia_evidencias WHERE certificacao_id = ? ORDER BY created_at ASC"
    ).bind(certId).all();
    return results || [];
  }

  static async getAuditByCertId(db: D1Database, certId: string): Promise<any[]> {
    const { results } = await db.prepare(
      "SELECT * FROM ia_auditoria WHERE certificacao_id = ? ORDER BY created_at DESC"
    ).bind(certId).all();
    return results || [];
  }

  static async getById(db: D1Database, id: string): Promise<any> {
    return await db.prepare(
      "SELECT * FROM ia_evidencias WHERE id = ?"
    ).bind(id).first();
  }

  static async findByHash(db: D1Database, hash: string): Promise<any> {
    return await db.prepare(
      "SELECT * FROM ia_evidencias WHERE ia_hash_arquivo = ? LIMIT 1"
    ).bind(hash).first();
  }

  static async save(db: D1Database, data: any): Promise<void> {
    const existing = await this.getById(db, data.id);
    if (existing) {
      await db.prepare(`
        UPDATE ia_evidencias SET
          status_ia = ?, resultado_ia = ?, justificativa_ia = ?, confianca_ia = ?,
          decisao_cq = ?, observacao_cq = ?, ia_modelo = ?, ia_custo_estimado = ?,
          ia_hash_arquivo = ?, ia_origem = ?, imagem_repetida = ?, imagem_repetida_alerta = ?,
          risco_reuso = ?, usuario_upload_id = ?, perfil_upload = ?, login_hash = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        data.status_ia,
        data.resultado_ia,
        data.justificativa_ia,
        data.confianca_ia,
        data.decisao_cq,
        data.observacao_cq,
        data.ia_modelo,
        data.ia_custo_estimado,
        data.ia_hash_arquivo,
        data.ia_origem,
        data.imagem_repetida ? 1 : 0,
        data.imagem_repetida_alerta || '',
        data.risco_reuso || 'BAIXO',
        data.usuario_upload_id,
        data.perfil_upload,
        data.login_hash,
        data.id
      ).run();
    } else {
      await db.prepare(`
        INSERT INTO ia_evidencias (
          id, certificacao_id, etapa, tipo_arquivo, arquivo_url, arquivo_key,
          status_ia, resultado_ia, justificativa_ia, confianca_ia, decisao_cq, observacao_cq,
          ia_modelo, ia_custo_estimado, ia_hash_arquivo, ia_origem, imagem_repetida,
          imagem_repetida_alerta, risco_reuso, usuario_upload_id, perfil_upload, login_hash,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        data.id,
        data.certificacao_id,
        data.etapa,
        data.tipo_arquivo,
        data.arquivo_url,
        data.arquivo_key,
        data.status_ia || 'PENDENTE',
        data.resultado_ia || null,
        data.justificativa_ia || null,
        data.confianca_ia || null,
        data.decisao_cq || null,
        data.observacao_cq || null,
        data.ia_modelo || null,
        data.ia_custo_estimado || 0,
        data.ia_hash_arquivo || null,
        data.ia_origem || 'AUTOMATICA',
        data.imagem_repetida ? 1 : 0,
        data.imagem_repetida_alerta || null,
        data.risco_reuso || 'BAIXO',
        data.usuario_upload_id,
        data.perfil_upload,
        data.login_hash
      ).run();
    }
  }

  static async deleteEvidence(db: D1Database, id: string): Promise<void> {
    await db.prepare("DELETE FROM ia_evidencias WHERE id = ?").bind(id).run();
  }

  static async logAudit(db: D1Database, audit: any): Promise<void> {
    await db.prepare(`
      INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      audit.certificacao_id || audit.certificacaoId,
      audit.evidencia_id || audit.evidenciaId || null,
      audit.acao,
      audit.payload ? JSON.stringify(audit.payload) : '{}',
      audit.usuario_id || audit.usuarioId,
      audit.perfil_usuario || audit.perfilUsuario,
      audit.login_hash || audit.loginHash
    ).run();
    Logger.auditoria(`Auditoria registrada - Ação: ${audit.acao} pelo usuário ${audit.usuario_id}`);
  }
}

export class CQRepository {
  static async getAllAvaliadores(db: D1Database): Promise<any[]> {
    const { results } = await db.prepare(
      "SELECT * FROM avaliadores ORDER BY nome ASC"
    ).all();
    return results || [];
  }

  static async getAvaliadorByNome(db: D1Database, nome: string): Promise<any> {
    return await db.prepare("SELECT id FROM avaliadores WHERE nome = ?").bind(nome).first();
  }

  static async createAvaliador(db: D1Database, data: any): Promise<any> {
    const parts = (data.cidadeBase || '').split(' - ');
    const cidade = parts[0] || '';
    const base = parts[1] || '';
    const statusUpper = (data.status || 'Ativo').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
    const ativoVal = statusUpper === 'ATIVO' ? 1 : 0;

    const result = await db.prepare(
      "INSERT INTO avaliadores (nome, perfil, cidade, base, cidade_base, ativo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(
      data.nome,
      data.perfil,
      cidade,
      base,
      data.cidadeBase || '',
      ativoVal,
      statusUpper
    ).run();

    return result.meta?.last_row_id || (result as any).lastRowId;
  }

  static async findTecnicoByMatricula(db: D1Database, matricula: string): Promise<any> {
    return await db.prepare("SELECT id FROM tecnicos WHERE matricula = ?").bind(matricula).first();
  }

  static async createTecnico(db: D1Database, t: any): Promise<number> {
    const resultTec = await db.prepare(
      "INSERT INTO tecnicos (nome, matricula, empresa, cidade_base, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(
      t.nomeTecnico,
      t.matricula,
      t.empresa,
      t.cidadeBase
    ).run();
    return resultTec.meta?.last_row_id || (resultTec as any).lastRowId;
  }
}

export class RulesRepository {
  static async getByCertAndEtapa(db: D1Database, certType: string, etapa: string): Promise<any> {
    return await db.prepare(`
      SELECT * FROM ia_regras_itens 
      WHERE tipo_certificacao = ? AND etapa = ?
    `).bind(certType, etapa).first();
  }

  static async save(db: D1Database, data: any): Promise<void> {
    const existing = await this.getByCertAndEtapa(db, data.tipo_certificacao, data.etapa);
    if (existing) {
      await db.prepare(`
        UPDATE ia_regras_itens 
        SET regras_texto = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(data.regras_texto, existing.id).run();
    } else {
      await db.prepare(`
        INSERT INTO ia_regras_itens (tipo_certificacao, etapa, regras_texto, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(data.tipo_certificacao, data.etapa, data.regras_texto).run();
    }
  }
}

export class LgpdConfigRepository {
  static async getAll(db: D1Database): Promise<any[]> {
    const { results } = await db.prepare("SELECT * FROM ia_lgpd_config").all();
    return results || [];
  }
}
