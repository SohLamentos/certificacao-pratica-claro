import { initDb, Env, jsonResponse } from '../../_db';
import { logEvent, LogLevel } from '../../_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const id = params.id as string;

  if (!id) {
    return jsonResponse({ success: false, error: "id da missão é obrigatório" }, 400);
  }

  try {
    await initDb(env.DB);

    // Fetch existing mission first to get certificacao_id
    const mission = await env.DB.prepare(
      "SELECT * FROM missoes_evidencias WHERE id = ?"
    ).bind(id).first() as any;

    if (!mission) {
      return jsonResponse({ success: false, error: "Missão não encontrada" }, 404);
    }

    if (request.method === 'GET') {
      // 1. Fetch all items in the certification
      const itemsRows = await env.DB.prepare(`
        SELECT i.*, g.nome as grupo_nome
        FROM itens i
        LEFT JOIN grupos g ON i.grupo_id = g.id
        WHERE i.certificacao_id = ? AND i.ativo = 1
        ORDER BY g.nome ASC, i.ordem ASC
      `).bind(mission.certificacao_id).all();

      // 2. Fetch current mappings for this mission
      const mappingsRows = await env.DB.prepare(`
        SELECT * FROM missao_evidencia_itens
        WHERE missao_id = ?
      `).bind(id).all();

      return jsonResponse({
        success: true,
        items: itemsRows.results || [],
        mappings: mappingsRows.results || []
      });
    }

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      const { mappings, user } = data; // mappings is Array<{ item_id, tipo_validacao, peso_ia, confirmacao_cq_obrigatoria, ativo }>

      if (!mappings || !Array.isArray(mappings)) {
        return jsonResponse({ success: false, error: "Parâmetro 'mappings' deve ser um array." }, 400);
      }

      // Overwrite mappings: delete then insert
      // 1. Delete
      await env.DB.prepare("DELETE FROM missao_evidencia_itens WHERE missao_id = ?").bind(id).run();

      // 2. Insert if any
      if (mappings.length > 0) {
        const statements = mappings.map(m => {
          return env.DB.prepare(`
            INSERT INTO missao_evidencia_itens (missao_id, item_id, tipo_validacao, peso_ia, confirmacao_cq_obrigatoria, ativo)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            m.item_id,
            m.tipo_validacao || 'IMAGEM',
            m.peso_ia !== undefined ? m.peso_ia : 1.0,
            m.confirmacao_cq_obrigatoria ? 1 : 0,
            m.ativo !== false ? 1 : 0
          );
        });

        await (env.DB as any).batch(statements);
      }

      // Log audit event: MISSAO_ITENS_ATUALIZADOS
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const userAgent = request.headers.get("User-Agent") || "Unknown";
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "MISSAO_ITENS_ATUALIZADOS",
        usuario_id: user || "analista",
        perfil: "analista",
        ip: clientIp,
        userAgent,
        metadata: {
          missao_id: id,
          certificacao_id: mission.certificacao_id,
          total_itens_vinculados: mappings.length
        }
      });

      return jsonResponse({
        success: true,
        message: "Vínculos com itens do checklist atualizados com sucesso."
      });
    }

    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
