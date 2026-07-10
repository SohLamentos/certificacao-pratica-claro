import { initDb, Env, jsonResponse } from '../_db';
import { logEvent, LogLevel } from '../_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const id = params.id as string;

  if (!id) {
    return jsonResponse({ success: false, error: "id da missão é obrigatório" }, 400);
  }

  try {
    await initDb(env.DB);

    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const userAgent = request.headers.get("User-Agent") || "Unknown";

    // Fetch existing mission first
    const mission = await env.DB.prepare(
      "SELECT * FROM missoes_evidencias WHERE id = ?"
    ).bind(id).first() as any;

    if (!mission) {
      return jsonResponse({ success: false, error: "Missão não encontrada" }, 404);
    }

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      const {
        nome,
        descricao,
        orientacao_foto,
        grupo_evidencia,
        quantidade_minima,
        quantidade_maxima,
        obrigatoria,
        ordem,
        permite_camera,
        permite_galeria,
        prompt_ia_especifico,
        ativa,
        updated_by,
        exemplo_correto_r2_key,
        exemplo_incorreto_r2_key
      } = data;

      // Validations (Requirement 9)
      if (!nome || !nome.trim()) {
        return jsonResponse({ success: false, error: "O nome da missão é obrigatório." }, 400);
      }
      if (!descricao || !descricao.trim()) {
        return jsonResponse({ success: false, error: "A descrição da missão é obrigatória." }, 400);
      }
      if (quantidade_minima === undefined || quantidade_minima < 0) {
        return jsonResponse({ success: false, error: "Quantidade mínima inválida." }, 400);
      }
      if (quantidade_maxima === undefined || quantidade_maxima < quantidade_minima) {
        return jsonResponse({ success: false, error: "Quantidade máxima deve ser maior ou igual à quantidade mínima." }, 400);
      }
      if (ordem === undefined || ordem < 0) {
        return jsonResponse({ success: false, error: "Ordem inválida." }, 400);
      }
      if (obrigatoria && quantidade_minima < 1) {
        return jsonResponse({ success: false, error: "Se a missão é obrigatória, a quantidade mínima deve ser de pelo menos 1." }, 400);
      }

      const now = new Date().toISOString();
      const nextAtiva = ativa !== undefined ? (ativa ? 1 : 0) : mission.ativa;

      await env.DB.prepare(`
        UPDATE missoes_evidencias
        SET nome = ?,
            descricao = ?,
            orientacao_foto = ?,
            grupo_evidencia = ?,
            quantidade_minima = ?,
            quantidade_maxima = ?,
            obrigatoria = ?,
            ordem = ?,
            ativa = ?,
            permite_camera = ?,
            permite_galeria = ?,
            prompt_ia_especifico = ?,
            updated_by = ?,
            exemplo_correto_r2_key = ?,
            exemplo_incorreto_r2_key = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        nome.trim(),
        descricao.trim(),
        orientacao_foto ? orientacao_foto.trim() : null,
        grupo_evidencia ? grupo_evidencia.trim() : null,
        quantidade_minima,
        quantidade_maxima,
        obrigatoria ? 1 : 0,
        ordem,
        nextAtiva,
        permite_camera !== false ? 1 : 0,
        permite_galeria !== false ? 1 : 0,
        prompt_ia_especifico ? prompt_ia_especifico.trim() : null,
        updated_by || "analista",
        exemplo_correto_r2_key !== undefined ? exemplo_correto_r2_key : mission.exemplo_correto_r2_key,
        exemplo_incorreto_r2_key !== undefined ? exemplo_incorreto_r2_key : mission.exemplo_incorreto_r2_key,
        now,
        id
      ).run();

      // Log specific events: MISSAO_DESATIVADA / MISSAO_REATIVADA / MISSAO_EDITADA
      let auditEvent = "MISSAO_EDITADA";
      if (mission.ativa === 1 && nextAtiva === 0) {
        auditEvent = "MISSAO_DESATIVADA";
      } else if (mission.ativa === 0 && nextAtiva === 1) {
        auditEvent = "MISSAO_REATIVADA";
      }

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: auditEvent,
        usuario_id: updated_by || "analista",
        perfil: "analista",
        ip: clientIp,
        userAgent,
        metadata: {
          missao_id: id,
          certificacao_id: mission.certificacao_id,
          nome
        }
      });

      return jsonResponse({
        success: true,
        message: `Missão atualizada com sucesso (${auditEvent}).`
      });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const user = url.searchParams.get("user") || "analista";

      // Check if there are evidences linked to this mission (Requirement 3 & 9)
      const evidenceCheck = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM evidencias WHERE missao_id = ?"
      ).bind(id).first() as any;

      const hasEvidences = evidenceCheck && evidenceCheck.cnt > 0;

      if (hasEvidences) {
        // Logical deletion: set ativa = 0
        await env.DB.prepare(
          "UPDATE missoes_evidencias SET ativa = 0, updated_at = ? WHERE id = ?"
        ).bind(new Date().toISOString(), id).run();

        await logEvent(env, {
          tipo: LogLevel.AUDITORIA,
          evento: "MISSAO_DESATIVADA",
          usuario_id: user,
          perfil: "analista",
          ip: clientIp,
          userAgent,
          metadata: {
            missao_id: id,
            certificacao_id: mission.certificacao_id,
            nome: mission.nome,
            motivo: "Exclusão lógica devido a histórico de evidências vinculadas"
          }
        });

        return jsonResponse({
          success: true,
          message: "A missão possui evidências vinculadas no histórico. Ela foi desativada (exclusão lógica) para manter a integridade dos dados."
        });
      } else {
        // Physical deletion: DELETE
        // Also delete item mappings for this mission
        await env.DB.prepare("DELETE FROM missao_evidencia_itens WHERE missao_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM missoes_evidencias WHERE id = ?").bind(id).run();

        await logEvent(env, {
          tipo: LogLevel.AUDITORIA,
          evento: "MISSAO_EXCLUIDA",
          usuario_id: user,
          perfil: "analista",
          ip: clientIp,
          userAgent,
          metadata: {
            missao_id: id,
            certificacao_id: mission.certificacao_id,
            nome: mission.nome
          }
        });

        return jsonResponse({
          success: true,
          message: "Missão excluída fisicamente com sucesso, pois não possuía evidências associadas."
        });
      }
    }

    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
