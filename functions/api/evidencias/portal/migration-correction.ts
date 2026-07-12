import { initDb, Env, jsonResponse } from '../../_db';
import { LogLevel, logEvent } from '../../_logger';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);

    const query = `
      SELECT 
        p.id as portal_id, 
        p.avaliacao_id, 
        p.status as portal_status, 
        a.status as avaliacao_status, 
        a.nome_tecnico, 
        a.data as data_avaliacao,
        (SELECT COUNT(*) FROM evidencias e WHERE e.portal_id = p.id) as total_evidencias
      FROM portais_evidencias p
      JOIN avaliacoes a ON p.avaliacao_id = a.id
      WHERE a.status NOT IN ('APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW', 'NOSHOW', 'NO-SHOW')
        AND p.status IN ('ENCERRADO', 'EVIDENCIAS_ENVIADAS')
        AND (SELECT COUNT(*) FROM evidencias e WHERE e.portal_id = p.id) > 0
    `;

    const { results } = await env.DB.prepare(query).all();

    return jsonResponse({
      success: true,
      count: results ? results.length : 0,
      records: results || []
    });
  } catch (error) {
    console.error("Error in migration-correction GET:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);

    // Fetch the list first to audit and return precisely what we correct
    const query = `
      SELECT 
        p.id as portal_id, 
        p.avaliacao_id, 
        p.status as portal_status, 
        a.status as avaliacao_status, 
        a.nome_tecnico, 
        a.data as data_avaliacao
      FROM portais_evidencias p
      JOIN avaliacoes a ON p.avaliacao_id = a.id
      WHERE a.status NOT IN ('APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW', 'NOSHOW', 'NO-SHOW')
        AND p.status IN ('ENCERRADO', 'EVIDENCIAS_ENVIADAS')
        AND (SELECT COUNT(*) FROM evidencias e WHERE e.portal_id = p.id) > 0
    `;

    const { results: recordsToCorrect } = await env.DB.prepare(query).all();
    const count = recordsToCorrect ? recordsToCorrect.length : 0;

    if (count > 0) {
      const now = new Date().toISOString();
      const ids = (recordsToCorrect as any[]).map(r => r.portal_id);
      
      // Update those portais to AGUARDANDO_ANALISE
      for (const portalId of ids) {
        await env.DB.prepare(`
          UPDATE portais_evidencias 
          SET status = 'AGUARDANDO_ANALISE', 
              updated_at = ?
          WHERE id = ?
        `).bind(now, portalId).run();

        // Audit log
        await logEvent(env, {
          tipo: LogLevel.AUDITORIA,
          evento: "PORTAL_STATUS_ATUALIZADO",
          usuario_id: "sistema",
          perfil: "sistema",
          ip: "127.0.0.1",
          userAgent: "migration-script",
          metadata: {
            portal_id: portalId,
            old_status: "ENCERRADO",
            new_status: "AGUARDANDO_ANALISE",
            reason: "Correção automática de status de portal de evidências"
          }
        });
      }

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAIS_CORRIGIDOS_MIGRATION",
        usuario_id: "sistema",
        perfil: "sistema",
        ip: "127.0.0.1",
        userAgent: "migration-script",
        metadata: {
          quantity_corrected: count,
          corrected_portals: ids
        }
      });
    }

    return jsonResponse({
      success: true,
      message: `${count} portais corrigidos com sucesso para o status AGUARDANDO_ANALISE.`,
      count,
      corrected: recordsToCorrect || []
    });
  } catch (error) {
    console.error("Error in migration-correction POST:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
