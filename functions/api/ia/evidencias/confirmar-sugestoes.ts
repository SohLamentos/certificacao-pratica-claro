import { initDb, Env, jsonResponse } from '../../_db';
import { logEvent, LogLevel } from '../../_logger';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";

  try {
    await initDb(env.DB);

    const { 
      avaliacao_id, 
      decisoes_override = {}, 
      observacoes = {}, 
      usuario_id, 
      perfil_usuario 
    } = await request.json() as { 
      avaliacao_id: string; 
      decisoes_override?: Record<string, 'APROVADO' | 'REPROVADO'>;
      observacoes?: Record<string, string>;
      usuario_id?: string;
      perfil_usuario?: string;
    };

    if (!avaliacao_id) {
      return jsonResponse({ success: false, error: "Parâmetro 'avaliacao_id' é obrigatório." }, 400);
    }

    const finalUserId = usuario_id || "sistema-ia-user";
    const finalPerfil = perfil_usuario || "SISTEMA";

    // 1. Fetch evaluation
    const avaliacao = await env.DB.prepare(
      "SELECT * FROM avaliacoes WHERE id = ?"
    ).bind(avaliacao_id).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação não encontrada." }, 404);
    }

    if (!avaliacao.ia_resultado_consolidado_json) {
      return jsonResponse({ success: false, error: "Não há nenhuma análise consolidada de IA salva para esta avaliação." }, 400);
    }

    let resultJson: any = null;
    try {
      resultJson = JSON.parse(avaliacao.ia_resultado_consolidado_json);
    } catch (e) {
      return jsonResponse({ success: false, error: "Erro de integridade ao ler resultado consolidado da IA." }, 500);
    }

    const analises = resultJson.analises_missoes || {};
    const missionIds = Object.keys(analises);

    if (missionIds.length === 0) {
      return jsonResponse({ success: false, error: "Análise consolidada está vazia de missões." }, 400);
    }

    // Begin updates
    // A) Update individual evidence status and CQ decisions
    for (const missionId of missionIds) {
      const mRes = analises[missionId];
      if (mRes.status === 'SEM_EVIDENCIA') continue;

      const primaryEv = mRes.imagem_utilizada;
      if (!primaryEv || !primaryEv.id) continue;

      const decision = decisoes_override[missionId] || (mRes.aprovada ? 'APROVADO' : 'REPROVADO');
      const obs = observacoes[missionId] || mRes.justificativa || '';

      // Update evidencias table
      await env.DB.prepare(`
        UPDATE evidencias 
        SET 
          decisao_cq = ?, 
          observacao_cq = ?, 
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).bind(decision, obs, primaryEv.id).run();

      // Log ia_auditoria record
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
        VALUES (?, ?, 'CQ_CONFIRMOU_SUGESTAO_CONSOLIDADA', ?, ?, ?, ?)
      `).bind(
        avaliacao_id,
        primaryEv.id,
        JSON.stringify({
          missao_id: missionId,
          etapa: mRes.nome_missao,
          decisao_original_ia: mRes.aprovada ? 'APROVADO' : 'REPROVADO',
          decisao_cq: decision,
          observacao_cq: obs,
          reaproveitada: mRes.reaproveitada || false
        }),
        finalUserId,
        finalPerfil,
        ""
      ).run();
    }

    // B) Sync checklist responses for backward compatibility with D1 checklist
    // First, let's load all current mapped responses to do differential updates, or just wipe and sync
    // It's safer to read the current responses, override the ones mapped to these missions, and sync them back!
    const curResponsesRows = await env.DB.prepare("SELECT * FROM respostas WHERE avaliacao_id = ?").bind(avaliacao_id).all();
    const responsesMap = new Map<number, string>();
    (curResponsesRows.results || []).forEach((r: any) => {
      responsesMap.set(r.item_id, r.resposta);
    });

    // Update with IA suggestions
    for (const missionId of missionIds) {
      const mRes = analises[missionId];
      if (mRes.status === 'SEM_EVIDENCIA') continue;

      const items = mRes.itens || {};
      for (const [itemIdStr, itemData] of Object.entries(items)) {
        const itemId = parseInt(itemIdStr, 10);
        if (isNaN(itemId)) continue;

        const atende = (itemData as any).atende;
        // Map to standard responses 'CONFORME' or 'NAO_CONFORME'
        const mappedResp = atende ? 'CONFORME' : 'NAO_CONFORME';
        responsesMap.set(itemId, mappedResp);
      }
    }

    // Wiping responses for this evaluation and re-inserting synced answers
    await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(avaliacao_id).run();
    for (const [itemId, respValue] of responsesMap.entries()) {
      await env.DB.prepare(
        "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
      ).bind(avaliacao_id, itemId, respValue).run();
    }

    // C) Calculate new status based on overall conforming answers
    let allConforme = true;
    for (const respVal of responsesMap.values()) {
      if (respVal === 'NAO_CONFORME') {
        allConforme = false;
        break;
      }
    }
    const proposedStatus = allConforme ? 'APROVADA' : 'REPROVADA';

    // D) Update evaluation consolidated status
    await env.DB.prepare(`
      UPDATE avaliacoes 
      SET 
        ia_status_consolidado = 'CONFIRMADA_CQ',
        status = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(proposedStatus, avaliacao_id).run();

    // Audit Log event
    await logEvent(env, {
      tipo: LogLevel.INFO,
      evento: `CQ confirmou e aplicou as sugestões consolidadas da IA`,
      usuario_id: finalUserId,
      perfil: finalPerfil,
      ip: clientIp,
      userAgent,
      metadata: { 
        avaliacao_id, 
        status_final: proposedStatus
      }
    });

    return jsonResponse({
      success: true,
      mensagem: "Sugestões consolidadas aplicadas com sucesso para todas as etapas!",
      status_final_avaliacao: proposedStatus
    });

  } catch (err: any) {
    console.error("Erro ao confirmar sugestões:", err);
    return jsonResponse({
      success: false,
      error: "Erro interno no servidor ao confirmar decisões: " + err.message
    }, 500);
  }
};
