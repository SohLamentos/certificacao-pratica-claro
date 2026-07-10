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

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const data = await request.json() as any;
    const { targetCertificacaoId, user } = data;

    if (!targetCertificacaoId) {
      return jsonResponse({ success: false, error: "targetCertificacaoId é obrigatório." }, 400);
    }

    // Load source mission
    const mission = await env.DB.prepare(
      "SELECT * FROM missoes_evidencias WHERE id = ?"
    ).bind(id).first() as any;

    if (!mission) {
      return jsonResponse({ success: false, error: "Missão de origem não encontrada." }, 404);
    }

    // Verify target certification exists
    const certCheck = await env.DB.prepare(
      "SELECT id FROM certificacoes WHERE id = ?"
    ).bind(targetCertificacaoId).first() as any;

    if (!certCheck) {
      return jsonResponse({ success: false, error: "Certificação de destino não encontrada." }, 404);
    }

    const newId = "missao_" + crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO missoes_evidencias (
        id, certificacao_id, nome, descricao, orientacao_foto, grupo_evidencia,
        quantidade_minima, quantidade_maxima, obrigatoria, ordem, ativa,
        permite_camera, permite_galeria, prompt_ia_especifico, created_by, updated_by,
        exemplo_correto_r2_key, exemplo_incorreto_r2_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      targetCertificacaoId,
      mission.nome,
      mission.descricao,
      mission.orientacao_foto,
      mission.grupo_evidencia,
      mission.quantidade_minima,
      mission.quantidade_maxima,
      mission.obrigatoria,
      mission.ordem,
      mission.permite_camera,
      mission.permite_galeria,
      mission.prompt_ia_especifico,
      user || "analista",
      user || "analista",
      mission.exemplo_correto_r2_key,
      mission.exemplo_incorreto_r2_key,
      now,
      now
    ).run();

    // Log audit event: MISSAO_DUPLICADA
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const userAgent = request.headers.get("User-Agent") || "Unknown";
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: "MISSAO_DUPLICADA",
      usuario_id: user || "analista",
      perfil: "analista",
      ip: clientIp,
      userAgent,
      metadata: {
        missao_origem_id: id,
        missao_destino_id: newId,
        certificacao_origem_id: mission.certificacao_id,
        certificacao_destino_id: targetCertificacaoId,
        nome: mission.nome
      }
    });

    return jsonResponse({
      success: true,
      data: { id: newId },
      message: "Missão duplicada com sucesso para a certificação de destino."
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
