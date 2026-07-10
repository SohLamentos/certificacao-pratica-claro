import { initDb, Env, jsonResponse } from '../../_db';
import { logEvent, LogLevel } from '../../_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const certificacaoId = parseInt(params.certificacaoId as string, 10);

  if (isNaN(certificacaoId)) {
    return jsonResponse({ success: false, error: "certificacaoId inválido" }, 400);
  }

  try {
    await initDb(env.DB);

    if (request.method === 'GET') {
      // Get all missions for this certification with item count
      const rows = await env.DB.prepare(`
        SELECT m.*, 
               (SELECT COUNT(*) FROM missao_evidencia_itens WHERE missao_id = m.id AND ativo = 1) as total_itens
        FROM missoes_evidencias m
        WHERE m.certificacao_id = ?
        ORDER BY m.ordem ASC
      `).bind(certificacaoId).all();

      return jsonResponse({
        success: true,
        data: rows.results || []
      });
    }

    if (request.method === 'POST') {
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
        created_by,
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

      const id = "missao_" + crypto.randomUUID();
      const now = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO missoes_evidencias (
          id, certificacao_id, nome, descricao, orientacao_foto, grupo_evidencia,
          quantidade_minima, quantidade_maxima, obrigatoria, ordem, ativa,
          permite_camera, permite_galeria, prompt_ia_especifico, created_by, updated_by,
          exemplo_correto_r2_key, exemplo_incorreto_r2_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        certificacaoId,
        nome.trim(),
        descricao.trim(),
        orientacao_foto ? orientacao_foto.trim() : null,
        grupo_evidencia ? grupo_evidencia.trim() : null,
        quantidade_minima,
        quantidade_maxima,
        obrigatoria ? 1 : 0,
        ordem,
        permite_camera !== false ? 1 : 0,
        permite_galeria !== false ? 1 : 0,
        prompt_ia_especifico ? prompt_ia_especifico.trim() : null,
        created_by || "analista",
        created_by || "analista",
        exemplo_correto_r2_key || null,
        exemplo_incorreto_r2_key || null,
        now,
        now
      ).run();

      // Log event: MISSAO_CRIADA
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const userAgent = request.headers.get("User-Agent") || "Unknown";
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "MISSAO_CRIADA",
        usuario_id: created_by || "analista",
        perfil: "analista",
        ip: clientIp,
        userAgent,
        metadata: {
          missao_id: id,
          certificacao_id: certificacaoId,
          nome
        }
      });

      return jsonResponse({
        success: true,
        data: { id },
        message: "Missão criada com sucesso."
      });
    }

    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
