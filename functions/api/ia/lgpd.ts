import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    
    // Fetch configs
    const configsQuery = await env.DB.prepare("SELECT * FROM ia_lgpd_config").all();
    const configs = configsQuery.results || [];

    // Map configs to an object for easy use
    const configMap: Record<string, string> = {};
    configs.forEach((c: any) => {
      configMap[c.chave] = c.valor;
    });

    // Fetch audit logs
    const auditQuery = await env.DB.prepare(
      "SELECT * FROM ia_auditoria ORDER BY created_at DESC LIMIT 200"
    ).all();
    const auditLogs = auditQuery.results || [];

    return jsonResponse({
      success: true,
      configs: configMap,
      auditLogs: auditLogs
    });
  } catch (err: any) {
    console.error("GET /api/ia/lgpd error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao obter dados de conformidade." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;
    const { action, chave, valor, dias, tecnicoId, matricula, usuario_executor } = body;

    const executor = usuario_executor || "CQ_ADMIN";

    if (action === 'save_config') {
      if (!chave || valor === undefined) {
        return jsonResponse({ success: false, error: "Chave e valor são obrigatórios." }, 400);
      }

      await env.DB.prepare(`
        INSERT INTO ia_lgpd_config (chave, valor)
        VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
      `).bind(chave, String(valor)).run();

      // Log in audit trail
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, acao, payload, usuario_id)
        VALUES (?, ?, ?, ?)
      `).bind(
        0,
        "CONFIG_LGPD_ATUALIZADA",
        JSON.stringify({ chave, valor }),
        executor
      ).run();

      return jsonResponse({ success: true, message: `Configuração "${chave}" salva com sucesso.` });
    }

    if (action === 'purge_retention') {
      const days = parseInt(dias, 10);
      if (isNaN(days) || days < 0) {
        return jsonResponse({ success: false, error: "Quantidade de dias de retenção inválida." }, 400);
      }

      // 1. Purge old audit logs
      const auditPurge = await env.DB.prepare(`
        DELETE FROM ia_auditoria 
        WHERE created_at < date('now', '-' || ? || ' days')
      `).bind(days).run();

      // 2. Purge old evidence files / records
      // In a production environment, we would also list R2 keys and delete them, 
      // but for DB persistence we delete their database entries to prevent tracking.
      const evidencePurge = await env.DB.prepare(`
        DELETE FROM ia_evidencias
        WHERE created_at < date('now', '-' || ? || ' days')
      `).bind(days).run();

      // Log the purging action
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, acao, payload, usuario_id)
        VALUES (?, ?, ?, ?)
      `).bind(
        0,
        "EXPURGO_RETENCAO_EXECUTADO",
        JSON.stringify({ 
          dias_limite: days, 
          registros_auditoria_removidos: auditPurge.meta?.changes || 0,
          evidencias_removidas: evidencePurge.meta?.changes || 0
        }),
        executor
      ).run();

      return jsonResponse({
        success: true,
        message: "Expurgo de dados executado de acordo com a política de retenção.",
        details: {
          auditPurgeCount: auditPurge.meta?.changes || 0,
          evidencePurgeCount: evidencePurge.meta?.changes || 0
        }
      });
    }

    if (action === 'anonymize_technician') {
      if (!tecnicoId) {
        return jsonResponse({ success: false, error: "ID do técnico é obrigatório." }, 400);
      }

      // Fetch technician first to get metadata for logging
      const tec = await env.DB.prepare("SELECT * FROM tecnicos WHERE id = ?").bind(tecnicoId).first() as any;
      if (!tec) {
        return jsonResponse({ success: false, error: "Técnico não encontrado." }, 404);
      }

      // Anonymize records in 'tecnicos'
      await env.DB.prepare(`
        UPDATE tecnicos
        SET nome = 'Técnico Anonimizado (LGPD Art. 18)',
            matricula = 'ANON_LGPD_' || id,
            empresa = 'ANONIMIZADA_LGPD',
            cidade_base = 'ANONIMIZADA',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(tecnicoId).run();

      // Anonymize in 'avaliacoes'
      const avUpdate = await env.DB.prepare(`
        UPDATE avaliacoes
        SET nome_tecnico = 'Técnico Anonimizado (LGPD Art. 18)',
            matricula = 'ANON_LGPD_' || tecnico_id,
            empresa = 'ANONIMIZADA_LGPD',
            cidade_base = 'ANONIMIZADA',
            updated_at = CURRENT_TIMESTAMP
        WHERE tecnico_id = ?
      `).bind(tecnicoId).run();

      // Log audit trail without storing the technician's actual personal data
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, acao, payload, usuario_id)
        VALUES (?, ?, ?, ?)
      `).bind(
        0,
        "DIREITO_AO_ESQUECIMENTO_ANONIMIZACAO",
        JSON.stringify({ 
          tecnico_id: tecnicoId,
          avaliacoes_afetadas: avUpdate.meta?.changes || 0
        }),
        executor
      ).run();

      return jsonResponse({
        success: true,
        message: "Os dados pessoais do técnico foram devidamente anonimizados em conformidade com a LGPD."
      });
    }

    if (action === 'forget_technician') {
      if (!tecnicoId) {
        return jsonResponse({ success: false, error: "ID do técnico é obrigatório." }, 400);
      }

      const tec = await env.DB.prepare("SELECT * FROM tecnicos WHERE id = ?").bind(tecnicoId).first() as any;
      if (!tec) {
        return jsonResponse({ success: false, error: "Técnico não encontrado." }, 404);
      }

      // Find all evaluation IDs
      const { results: avs } = await env.DB.prepare("SELECT id FROM avaliacoes WHERE tecnico_id = ?").bind(tecnicoId).all();
      const avIds = (avs || []).map((row: any) => row.id);

      let responsesDeleted = 0;
      let evidencesDeleted = 0;

      if (avIds.length > 0) {
        const placeholders = avIds.map(() => "?").join(",");
        
        // Delete responses
        const respsResult = await env.DB.prepare(`DELETE FROM respostas WHERE avaliacao_id IN (${placeholders})`).bind(...avIds).run();
        responsesDeleted = respsResult.meta?.changes || 0;

        // Delete evidences
        const evsResult = await env.DB.prepare(`DELETE FROM ia_evidencias WHERE certificacao_id IN (${placeholders})`).bind(...avIds).run();
        evidencesDeleted = evsResult.meta?.changes || 0;
      }

      // Delete evaluations
      const avsDeleteResult = await env.DB.prepare("DELETE FROM avaliacoes WHERE tecnico_id = ?").bind(tecnicoId).run();
      const evaluationsDeleted = avsDeleteResult.meta?.changes || 0;

      // Delete technician
      await env.DB.prepare("DELETE FROM tecnicos WHERE id = ?").bind(tecnicoId).run();

      // Log deletion to audit trail (using only non-sensitive technician ID to maintain complete deletion integrity)
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, acao, payload, usuario_id)
        VALUES (?, ?, ?, ?)
      `).bind(
        0,
        "DIREITO_AO_ESQUECIMENTO_EXCLUSAO",
        JSON.stringify({ 
          tecnico_id: tecnicoId,
          avaliacoes_removidas: evaluationsDeleted,
          respostas_removidas: responsesDeleted,
          evidencias_removidas: evidencesDeleted
        }),
        executor
      ).run();

      return jsonResponse({
        success: true,
        message: "Os dados do técnico, avaliações vinculadas, respostas e evidências foram permanentemente excluídos."
      });
    }

    return jsonResponse({ success: false, error: "Ação inválida." }, 400);
  } catch (err: any) {
    console.error("POST /api/ia/lgpd error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao executar ação LGPD." }, 500);
  }
};
