import { initDb, Env, jsonResponse } from '../../_db';
import { LogLevel, logEvent } from '../../_logger';

// Helper to safely determine previous operational status of an evaluation
async function determinePreviousStatus(db: any, evalId: string): Promise<{ proposed: string; method: string; motivo: string }> {
  // Priority 1: Check history/auditoria (app_logs)
  try {
    const logsRes = await db.prepare(`
      SELECT metadata_json, evento, created_at 
      FROM app_logs 
      WHERE metadata_json LIKE ? 
      ORDER BY created_at ASC
    `).bind(`%${evalId}%`).all();

    const logs = logsRes.results || [];
    for (const log of logs as any[]) {
      if (log.metadata_json) {
        try {
          const meta = JSON.parse(log.metadata_json);
          // Look for previous status or status values in metadata
          const possibleStatus = meta.old_status || meta.status_anterior || meta.previous_status;
          if (possibleStatus && ['AGENDADA', 'EM_ANDAMENTO'].includes(String(possibleStatus).toUpperCase())) {
            const finalStatus = String(possibleStatus).toUpperCase();
            return {
              proposed: finalStatus,
              method: 'histórico/auditoria',
              motivo: `Encontrado status anterior '${finalStatus}' registrado no evento '${log.evento}' em ${log.created_at}.`
            };
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }
  } catch (err) {
    console.error("Erro ao analisar histórico do app_logs:", err);
  }

  // Priority 2 & 3: Check appointment data (respostas checklist)
  try {
    const respRes = await db.prepare(`
      SELECT COUNT(*) as cnt 
      FROM respostas 
      WHERE avaliacao_id = ?
    `).bind(evalId).first() as any;

    const answersCount = respRes ? respRes.cnt : 0;
    if (answersCount > 0) {
      return {
        proposed: 'EM_ANDAMENTO',
        method: 'dados do agendamento',
        motivo: `Avaliação possui ${answersCount} respostas de checklist preenchidas, indicando que a execução foi iniciada.`
      };
    } else {
      return {
        proposed: 'AGENDADA',
        method: 'dados do agendamento',
        motivo: `Avaliação não possui nenhuma resposta de checklist preenchida, indicando que é um agendamento novo/pendente.`
      };
    }
  } catch (err) {
    console.error("Erro ao ler respostas para inferir status:", err);
  }

  // Priority 4: Indeterminável
  return {
    proposed: 'REVISAO_MANUAL',
    method: 'indeterminável',
    motivo: `Não foi possível determinar o status operacional com segurança. Direcionado para revisão manual.`
  };
}

// GET: Dry run to analyze affected portals and evaluations
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);

    // 1. Fetch Affected Portals
    const portalsQuery = `
      SELECT 
        p.id as portal_id, 
        p.avaliacao_id, 
        p.status as portal_status, 
        a.status as avaliacao_status, 
        a.nome_tecnico, 
        a.data as data_avaliacao
      FROM portais_evidencias p
      JOIN avaliacoes a ON p.avaliacao_id = a.id
      WHERE a.status NOT IN ('APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW', 'NOSHOW', 'NO-SHOW', 'FINALIZADA')
        AND p.status IN ('ENCERRADO', 'EVIDENCIAS_ENVIADAS')
    `;
    const { results: rawPortals } = await env.DB.prepare(portalsQuery).all();
    const portalsList = rawPortals || [];

    const portaisAfetados = portalsList.map((p: any) => ({
      id_interno: p.portal_id,
      avaliacao_id: p.avaliacao_id,
      status_atual: p.portal_status,
      status_proposto: 'AGUARDANDO_ANALISE',
      nome_tecnico: p.nome_tecnico,
      data_avaliacao: p.data_avaliacao,
      motivo: "Portal está marcado como encerrado ou com evidências enviadas, mas a avaliação correspondente ainda está em andamento (não finalizada)."
    }));

    // 2. Fetch Affected Evaluations
    const evalsQuery = `
      SELECT id, status, nome_tecnico, data 
      FROM avaliacoes 
      WHERE status IN ('AGUARDANDO_RESULTADO', 'AGUARDANDO_REVISAO_CQ')
    `;
    const { results: rawEvals } = await env.DB.prepare(evalsQuery).all();
    const evalsList = rawEvals || [];

    const avaliacoesAfetadas = [];
    for (const ev of evalsList as any[]) {
      const { proposed, method, motivo } = await determinePreviousStatus(env.DB, ev.id);
      avaliacoesAfetadas.push({
        id_interno: ev.id,
        status_atual: ev.status,
        status_proposto: proposed,
        nome_tecnico: ev.nome_tecnico,
        data_avaliacao: ev.data,
        metodo_determinacao: method,
        motivo: `Avaliação alterada indevidamente pelo fluxo de evidências. ${motivo}`
      });
    }

    return jsonResponse({
      success: true,
      dry_run: true,
      timestamp: new Date().toISOString(),
      portais_afetados_count: portaisAfetados.length,
      avaliacoes_afetadas_count: avaliacoesAfetadas.length,
      total_afetados: portaisAfetados.length + avaliacoesAfetadas.length,
      portais: portaisAfetados,
      avaliacoes: avaliacoesAfetadas,
      message: "Análise concluída (Dry Run). Nenhuma alteração foi realizada no banco de dados."
    });
  } catch (error) {
    console.error("Error in migration-correction GET:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};

// POST: Applies corrections after administrator confirmation
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);

    const body = await request.json() as any;
    const confirm = body.confirm === true || body.apply === true;

    // Run identical dry run check first
    // 1. Fetch Affected Portals
    const portalsQuery = `
      SELECT 
        p.id as portal_id, 
        p.avaliacao_id, 
        p.status as portal_status, 
        a.status as avaliacao_status, 
        a.nome_tecnico, 
        a.data as data_avaliacao
      FROM portais_evidencias p
      JOIN avaliacoes a ON p.avaliacao_id = a.id
      WHERE a.status NOT IN ('APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW', 'NOSHOW', 'NO-SHOW', 'FINALIZADA')
        AND p.status IN ('ENCERRADO', 'EVIDENCIAS_ENVIADAS')
    `;
    const { results: rawPortals } = await env.DB.prepare(portalsQuery).all();
    const portalsList = rawPortals || [];

    const portaisAfetados = portalsList.map((p: any) => ({
      id_interno: p.portal_id,
      avaliacao_id: p.avaliacao_id,
      status_atual: p.portal_status,
      status_proposto: 'AGUARDANDO_ANALISE',
      nome_tecnico: p.nome_tecnico,
      data_avaliacao: p.data_avaliacao,
      motivo: "Portal está marcado como encerrado ou com evidências enviadas, mas a avaliação correspondente ainda está em andamento (não finalizada)."
    }));

    // 2. Fetch Affected Evaluations
    const evalsQuery = `
      SELECT id, status, nome_tecnico, data 
      FROM avaliacoes 
      WHERE status IN ('AGUARDANDO_RESULTADO', 'AGUARDANDO_REVISAO_CQ')
    `;
    const { results: rawEvals } = await env.DB.prepare(evalsQuery).all();
    const evalsList = rawEvals || [];

    const avaliacoesAfetadas = [];
    for (const ev of evalsList as any[]) {
      const { proposed, method, motivo } = await determinePreviousStatus(env.DB, ev.id);
      avaliacoesAfetadas.push({
        id_interno: ev.id,
        status_atual: ev.status,
        status_proposto: proposed,
        nome_tecnico: ev.nome_tecnico,
        data_avaliacao: ev.data,
        metodo_determinacao: method,
        motivo: `Avaliação alterada indevidamente pelo fluxo de evidências. ${motivo}`
      });
    }

    if (!confirm) {
      // Just return dry run if not explicitly confirmed
      return jsonResponse({
        success: true,
        dry_run: true,
        timestamp: new Date().toISOString(),
        portais_afetados_count: portaisAfetados.length,
        avaliacoes_afetadas_count: avaliacoesAfetadas.length,
        total_afetados: portaisAfetados.length + avaliacoesAfetadas.length,
        portais: portaisAfetados,
        avaliacoes: avaliacoesAfetadas,
        message: "Análise concluída (Dry Run). Envie { confirm: true } no corpo da requisição para aplicar as correções."
      });
    }

    // APPLY ACTIONS!
    const now = new Date().toISOString();
    const portaisCorrigidos = [];
    const avaliacoesCorrigidas = [];
    const auditLogsGenerated: string[] = [];

    // Correct Portals
    for (const p of portaisAfetados) {
      await env.DB.prepare(`
        UPDATE portais_evidencias 
        SET status = 'AGUARDANDO_ANALISE', 
            updated_at = ?
        WHERE id = ?
      `).bind(now, p.id_interno).run();

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAL_STATUS_HIGIENIZADO",
        usuario_id: "admin_correction",
        perfil: "sistema",
        ip: "127.0.0.1",
        userAgent: "controlled-correction-module",
        metadata: {
          portal_id: p.id_interno,
          avaliacao_id: p.avaliacao_id,
          old_status: p.status_atual,
          new_status: 'AGUARDANDO_ANALISE',
          reason: p.motivo
        }
      });

      portaisCorrigidos.push({
        id: p.id_interno,
        status_anterior: p.status_atual,
        status_novo: 'AGUARDANDO_ANALISE'
      });
    }

    // Correct Evaluations
    for (const ev of avaliacoesAfetadas) {
      if (ev.status_proposto === 'REVISAO_MANUAL') {
        continue; // Do not alter automatically if safety is not met
      }

      await env.DB.prepare(`
        UPDATE avaliacoes 
        SET status = ?, 
            updated_at = ?
        WHERE id = ?
      `).bind(ev.status_proposto, now, ev.id_interno).run();

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "AVALIACAO_STATUS_HIGIENIZADO",
        usuario_id: "admin_correction",
        perfil: "sistema",
        ip: "127.0.0.1",
        userAgent: "controlled-correction-module",
        metadata: {
          avaliacao_id: ev.id_interno,
          old_status: ev.status_atual,
          new_status: ev.status_proposto,
          metodo: ev.metodo_determinacao,
          reason: ev.motivo
        }
      });

      avaliacoesCorrigidas.push({
        id: ev.id_interno,
        status_anterior: ev.status_atual,
        status_novo: ev.status_proposto,
        metodo: ev.metodo_determinacao
      });
    }

    // Overall correction log
    const masterLogId = crypto.randomUUID();
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: "HIGIENIZACAO_CONTROLADA_EXECUCAO",
      usuario_id: "admin_correction",
      perfil: "sistema",
      ip: "127.0.0.1",
      userAgent: "controlled-correction-module",
      metadata: {
        batch_id: masterLogId,
        portais_corrigidos_count: portaisCorrigidos.length,
        avaliacoes_corrigidas_count: avaliacoesCorrigidas.length,
        portais: portaisCorrigidos,
        avaliacoes: avaliacoesCorrigidas
      }
    });

    // Provide rollback queries for the admin
    const undoQueriesPortals = portaisCorrigidos.map(p => 
      `UPDATE portais_evidencias SET status = '${p.status_anterior}', updated_at = CURRENT_TIMESTAMP WHERE id = '${p.id}';`
    );
    const undoQueriesEvals = avaliacoesCorrigidas.map(a => 
      `UPDATE avaliacoes SET status = '${a.status_anterior}', updated_at = CURRENT_TIMESTAMP WHERE id = '${a.id}';`
    );

    return jsonResponse({
      success: true,
      dry_run: false,
      timestamp: now,
      batch_id: masterLogId,
      portais_corrigidos_count: portaisCorrigidos.length,
      avaliacoes_corrigidas_count: avaliacoesCorrigidas.length,
      portais_corrigidos: portaisCorrigidos,
      avaliacoes_corrigidas: avaliacoesCorrigidas,
      undetermined_manual_review_count: avaliacoesAfetadas.filter(a => a.status_proposto === 'REVISAO_MANUAL').length,
      manual_review_records: avaliacoesAfetadas.filter(a => a.status_proposto === 'REVISAO_MANUAL'),
      audit_logs_registered: [
        "PORTAL_STATUS_HIGIENIZADO",
        "AVALIACAO_STATUS_HIGIENIZADO",
        "HIGIENIZACAO_CONTROLADA_EXECUCAO"
      ],
      how_to_undo: {
        message: "Para desfazer esta higienização, execute as seguintes instruções SQL no console de banco de dados (D1):",
        queries: [...undoQueriesPortals, ...undoQueriesEvals]
      }
    });
  } catch (error) {
    console.error("Error in migration-correction POST:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
