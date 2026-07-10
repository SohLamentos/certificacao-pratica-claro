import { initDb, Env, jsonResponse } from '../_db';
import { logEvent, LogLevel } from '../_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    await initDb(env.DB);

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const data = await request.json() as any;
    const { action, certificacaoId, missaoId, tipoExemplo, arquivo_base64, mime_type, user } = data;

    if (!missaoId || !certificacaoId || !tipoExemplo) {
      return jsonResponse({ success: false, error: "Parâmetros 'missaoId', 'certificacaoId' e 'tipoExemplo' são obrigatórios." }, 400);
    }

    if (tipoExemplo !== 'correto' && tipoExemplo !== 'incorreto') {
      return jsonResponse({ success: false, error: "tipoExemplo deve ser 'correto' ou 'incorreto'." }, 400);
    }

    const columnToUpdate = tipoExemplo === 'correto' ? 'exemplo_correto_r2_key' : 'exemplo_incorreto_r2_key';

    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const userAgent = request.headers.get("User-Agent") || "Unknown";

    if (action === 'remove') {
      // 1. Update DB: set column to null
      await env.DB.prepare(`
        UPDATE missoes_evidencias
        SET ${columnToUpdate} = NULL, updated_at = ?
        WHERE id = ?
      `).bind(new Date().toISOString(), missaoId).run();

      // 2. Log audit event: EXEMPLO_FOTO_REMOVIDO
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EXEMPLO_FOTO_REMOVIDO",
        usuario_id: user || "analista",
        perfil: "analista",
        ip: clientIp,
        userAgent,
        metadata: {
          missao_id: missaoId,
          certificacao_id: certificacaoId,
          tipo_exemplo: tipoExemplo
        }
      });

      return jsonResponse({
        success: true,
        message: `Exemplo ${tipoExemplo} removido com sucesso.`
      });
    }

    if (action === 'upload') {
      if (!arquivo_base64 || !mime_type) {
        return jsonResponse({ success: false, error: "Parâmetros 'arquivo_base64' e 'mime_type' são obrigatórios para upload." }, 400);
      }

      // 1. Get bucket
      let bucket: any = null;
      if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.put === 'function') {
        bucket = env.EVIDENCIAS_BUCKET;
      }

      if (!bucket) {
        return jsonResponse({ success: false, error: "Serviço de Armazenamento R2 não configurado (EVIDENCIAS_BUCKET)." }, 500);
      }

      // 2. Convert base64 to binary bytes
      const pureBase64 = arquivo_base64.includes(",") ? arquivo_base64.split(",")[1] : arquivo_base64;
      const binaryString = atob(pureBase64);
      const fileBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fileBytes[i] = binaryString.charCodeAt(i);
      }

      // 3. Define R2 key: configuracoes/{certificacao_id}/missoes/{missao_id}/exemplos/{tipoExemplo}.{extension}
      const extension = mime_type === 'image/jpeg' ? 'jpg' : mime_type === 'image/png' ? 'png' : 'webp';
      const r2Key = `configuracoes/${certificacaoId}/missoes/${missaoId}/exemplos/${tipoExemplo}_${Date.now()}.${extension}`;

      // 4. Upload to R2
      await bucket.put(r2Key, fileBytes, {
        httpMetadata: { contentType: mime_type }
      });

      // 5. Update DB
      await env.DB.prepare(`
        UPDATE missoes_evidencias
        SET ${columnToUpdate} = ?, updated_at = ?
        WHERE id = ?
      `).bind(r2Key, new Date().toISOString(), missaoId).run();

      // 6. Log audit event: EXEMPLO_FOTO_ENVIADO
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EXEMPLO_FOTO_ENVIADO",
        usuario_id: user || "analista",
        perfil: "analista",
        ip: clientIp,
        userAgent,
        metadata: {
          missao_id: missaoId,
          certificacao_id: certificacaoId,
          tipo_exemplo: tipoExemplo,
          r2_key: r2Key
        }
      });

      return jsonResponse({
        success: true,
        r2_key: r2Key,
        message: `Exemplo ${tipoExemplo} enviado com sucesso.`
      });
    }

    return jsonResponse({ success: false, error: "Ação inválida." }, 400);

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
