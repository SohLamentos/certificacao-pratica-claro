import { initDb, Env, jsonResponse } from '@/functions/api/_db';
import { logEvent, LogLevel } from '@/functions/api/_logger';

async function computeHMAC(text: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(text)
  );
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPreflightToken(env: Env, tokenStr: string): Promise<any | null> {
  try {
    const parts = tokenStr.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const payloadStr = decodeURIComponent(escape(atob(base64Payload)));
    const secret = env.IMAGE_SIGNING_SECRET;
    if (!secret) return null;
    const expectedSignature = await computeHMAC("evidence-preflight:" + payloadStr, secret);
    if (signature !== expectedSignature) {
      return null;
    }
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expires_at) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const token = params.token as string;
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "";

    if (!env.IMAGE_SIGNING_SECRET) {
      try {
        await env.DB.prepare(`
          INSERT INTO app_logs (tipo, evento, usuario_id, perfil, ip_hash, user_agent_hash, metadata_json)
          VALUES ('ERROR', 'FALHA_CONFIG_CHAVE_ASSINATURA', 'sistema', 'sistema', '', '', ?)
        `).bind(JSON.stringify({
          erro: "IMAGE_SIGNING_SECRET não configurado",
          token_hash: token
        })).run();
      } catch (logErr) {
        console.error("Erro ao registrar log direto:", logErr);
      }

      return jsonResponse({
        success: false,
        error: "Erro de Configuração",
        message: "O serviço de envio está temporariamente indisponível devido a pendências de configuração do servidor. Por favor, contate o administrador do CQ."
      }, 500);
    }

    if (!token) {
      return jsonResponse({ success: false, error: "Token ausente" }, 400);
    }

    let data: any;
    try {
      data = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: "Payload JSON inválido" }, 400);
    }

    const { preflightToken } = data;
    if (!preflightToken) {
      return jsonResponse({ success: false, error: "Token de preflight ausente" }, 400);
    }

    // 1. Validate preflightToken
    const payload = await verifyPreflightToken(env, preflightToken);
    if (!payload) {
      return jsonResponse({ success: false, error: "Token de preflight inválido ou expirado. Faça um novo preflight." }, 400);
    }

    const {
      portal_id,
      avaliacao_id,
      missao_id,
      image_hash,
      action,
      target_r2_key,
      repetida_avaliacao_id,
      mime_type,
      tamanho_final,
      largura,
      altura
    } = payload;

    if (action !== "CREATE_LOGICAL_REFERENCE" && action !== "UPLOAD_WITH_REUSE_ALERT") {
      return jsonResponse({ success: false, error: "Ação de preflight não autoriza criação de referência lógica." }, 400);
    }

    // 2. Verify portal and mission
    const portal = await env.DB.prepare(
      "SELECT * FROM portais_evidencias WHERE token_hash = ?"
    ).bind(token).first() as any;

    if (!portal || portal.id !== portal_id) {
      return jsonResponse({ success: false, error: "Portal inválido ou divergente" }, 400);
    }

    const isClosed = portal.status === "BLOQUEADO" || portal.status === "EXPIRADO" || portal.status.startsWith("ENCERRADO_");
    if (isClosed) {
      return jsonResponse({ success: false, error: "Portal fechado para modificações." }, 403);
    }

    const avaliacao = await env.DB.prepare(
      "SELECT id, status FROM avaliacoes WHERE id = ?"
    ).bind(portal.avaliacao_id).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação relacionada não encontrada." }, 404);
    }

    const evalStatus = String(avaliacao.status).toUpperCase();
    const finishedStatuses = ["APROVADA", "APROVADO", "REPROVADA", "REPROVADO", "CANCELADA", "CANCELADO", "NO_SHOW", "NOSHOW", "NO-SHOW"];
    if (finishedStatuses.includes(evalStatus)) {
      return jsonResponse({ success: false, error: "A avaliação relacionada já foi concluída/fechada." }, 400);
    }

    // 3. Verify physical file exists in image_ref_counts
    const refRow = await env.DB.prepare(
      "SELECT r2_key, ref_count FROM image_ref_counts WHERE image_hash = ?"
    ).bind(image_hash).first() as { r2_key: string; ref_count: number } | null;

    if (!refRow || !refRow.r2_key) {
      return jsonResponse({ success: false, error: "O arquivo físico original não foi localizado. Por favor, faça o upload completo." }, 404);
    }

    const finalR2Key = target_r2_key || refRow.r2_key;

    // 4. Verify idempotency
    const existingEvidence = await env.DB.prepare(
      "SELECT id, r2_key, image_hash FROM evidencias WHERE avaliacao_id = ? AND missao_id = ?"
    ).bind(portal.avaliacao_id, missao_id).first() as any;

    if (existingEvidence && existingEvidence.image_hash === image_hash) {
      return jsonResponse({
        success: true,
        data: {
          status: "AGUARDANDO_ANALISE",
          evidencia: {
            id: existingEvidence.id,
            missaoId: missao_id,
            r2Key: existingEvidence.r2_key,
            imageHash: existingEvidence.image_hash,
            repetida: action === "UPLOAD_WITH_REUSE_ALERT" ? 1 : 0,
            enviadaEm: new Date().toISOString()
          }
        }
      });
    }

    const nowStr = new Date().toISOString();
    const evidenceId = existingEvidence ? existingEvidence.id : crypto.randomUUID();

    const statements = [];

    // Decouple old replaced reference
    let oldHashToClean: string | null = null;
    let oldR2KeyToClean: string | null = null;
    let shouldDeleteOldRef = false;
    let newOldRefCount = 0;

    if (existingEvidence && existingEvidence.image_hash && existingEvidence.image_hash !== image_hash) {
      oldHashToClean = existingEvidence.image_hash;
      oldR2KeyToClean = existingEvidence.r2_key;
      const oldRefRow = await env.DB.prepare(
        "SELECT ref_count FROM image_ref_counts WHERE image_hash = ?"
      ).bind(oldHashToClean).first() as { ref_count: number } | null;

      if (oldRefRow) {
        newOldRefCount = Math.max(0, oldRefRow.ref_count - 1);
        if (newOldRefCount === 0) {
          shouldDeleteOldRef = true;
        }
      }
    }

    if (oldHashToClean) {
      if (shouldDeleteOldRef) {
        statements.push(
          env.DB.prepare("DELETE FROM image_ref_counts WHERE image_hash = ?").bind(oldHashToClean)
        );
      } else {
        statements.push(
          env.DB.prepare("UPDATE image_ref_counts SET ref_count = ? WHERE image_hash = ?").bind(newOldRefCount, oldHashToClean)
        );
      }
    }

    // Increment new file reference once
    statements.push(
      env.DB.prepare(`
        INSERT INTO image_ref_counts (image_hash, r2_key, ref_count, last_used_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(image_hash) DO UPDATE SET
          ref_count = ref_count + 1,
          last_used_at = CURRENT_TIMESTAMP
      `).bind(image_hash, finalR2Key)
    );

    const image_signature = await computeHMAC(`${image_hash}:tecnico:${portal.avaliacao_id}`, env.IMAGE_SIGNING_SECRET!);
    const isRepetida = action === "UPLOAD_WITH_REUSE_ALERT" ? 1 : 0;
    const repetidaAvalId = action === "UPLOAD_WITH_REUSE_ALERT" ? (repetida_avaliacao_id || null) : null;

    // Save standard evidence record
    statements.push(
      env.DB.prepare(`
        INSERT INTO evidencias (id, portal_id, avaliacao_id, missao_id, tecnico_login_hash, r2_key, image_hash, image_signature, mime_type, tamanho_original, tamanho_final, largura, altura, status, repetida, repetida_avaliacao_id, enviada_em, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          r2_key = excluded.r2_key,
          image_hash = excluded.image_hash,
          image_signature = excluded.image_signature,
          tamanho_original = excluded.tamanho_original,
          tamanho_final = excluded.tamanho_final,
          largura = excluded.largura,
          altura = excluded.altura,
          status = 'PENDENTE',
          repetida = excluded.repetida,
          repetida_avaliacao_id = excluded.repetida_avaliacao_id,
          enviada_em = excluded.enviada_em,
          updated_at = excluded.updated_at
      `).bind(
        evidenceId,
        portal.id,
        portal.avaliacao_id,
        missao_id,
        null,
        finalR2Key,
        image_hash,
        image_signature,
        mime_type || 'image/webp',
        tamanho_final || null,
        tamanho_final || null,
        largura || null,
        altura || null,
        isRepetida,
        repetidaAvalId,
        nowStr,
        nowStr,
        nowStr
      )
    );

    // Update portal status to EM_ENVIO
    statements.push(
      env.DB.prepare(`
        UPDATE portais_evidencias
        SET status = 'EM_ENVIO', updated_at = ?
        WHERE id = ?
      `).bind(nowStr, portal.id)
    );

    // Execute atomic transaction
    try {
      await (env.DB as any).batch(statements);
    } catch (txError: any) {
      console.error("D1 Reference Commit Batch Error:", txError);
      return jsonResponse({
        success: false,
        error: "Não foi possível concluir o envio da foto. Por favor, tente novamente."
      }, 500);
    }

    // Clean up old replaced R2 file if needed
    if (shouldDeleteOldRef && oldR2KeyToClean) {
      try {
        let bucket: any = env.EVIDENCIAS_BUCKET || env.BUCKET || env.R2;
        if (bucket && typeof bucket.delete === 'function') {
          await bucket.delete(oldR2KeyToClean);
        }
      } catch (delErr) {
        console.error("Error deleting old replaced R2 photo:", delErr);
      }
    }

    // Mirror to IA evidences
    try {
      const mission = await env.DB.prepare(
        "SELECT nome FROM missoes_evidencias WHERE id = ?"
      ).bind(missao_id).first() as any;

      const targetStage = mission ? mission.nome : `Missão ${missao_id}`;
      const fileUrl = `/api/ia/evidencias/file?key=${encodeURIComponent(finalR2Key)}`;

      const existingIa = await env.DB.prepare(
        "SELECT id FROM ia_evidencias WHERE certificacao_id = ? AND etapa = ?"
      ).bind(portal.avaliacao_id, targetStage).first() as any;

      const iaEvId = existingIa ? existingIa.id : crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO ia_evidencias (id, certificacao_id, etapa, tipo_arquivo, arquivo_url, arquivo_key, status_ia, resultado_ia, justificativa_ia, confianca_ia, decisao_cq, observacao_cq, ia_modelo, ia_custo_estimado, ia_hash_arquivo, image_signature, ia_origem, imagem_repetida, imagem_repetida_alerta, risco_reuso, usuario_upload_id, perfil_upload, login_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?, 'MANUAL', ?, ?, ?, ?, 'tecnico', '', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          arquivo_url = excluded.arquivo_url,
          arquivo_key = excluded.arquivo_key,
          ia_hash_arquivo = excluded.ia_hash_arquivo,
          image_signature = excluded.image_signature,
          status_ia = 'PENDENTE',
          resultado_ia = NULL,
          justificativa_ia = NULL,
          imagem_repetida = excluded.imagem_repetida,
          imagem_repetida_alerta = excluded.imagem_repetida_alerta,
          risco_reuso = excluded.risco_reuso,
          updated_at = excluded.updated_at
      `).bind(
        iaEvId,
        portal.avaliacao_id,
        targetStage,
        mime_type || 'image/webp',
        fileUrl,
        finalR2Key,
        image_hash,
        image_signature,
        isRepetida,
        isRepetida ? `Imagem idêntica detectada na avaliação de ID: ${repetidaAvalId}` : null,
        isRepetida ? 'ALTO' : 'BAIXO',
        'tecnico',
        nowStr,
        nowStr
      ).run();
    } catch (iaError) {
      console.error("Non-blocking IA sync failure on reference commit:", iaError);
    }

    // Log metrics
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: "EVIDENCIA_REFERENCIA_REUTILIZADA",
      usuario_id: "tecnico",
      perfil: "tecnico",
      ip: clientIp,
      userAgent,
      metadata: {
        portal_id: portal.id,
        avaliacao_id: portal.avaliacao_id,
        missao_id: missao_id,
        image_hash,
        evidence_id: evidenceId,
        is_repetida: isRepetida,
        saved_bytes: tamanho_final
      }
    });

    if (isRepetida) {
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EVIDENCIA_REUSO_ENTRE_AVALIACOES",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missao_id,
          image_hash,
          repetida_avaliacao_id: repetidaAvalId
        }
      });
    }

    return jsonResponse({
      success: true,
      data: {
        status: "AGUARDANDO_ANALISE",
        evidencia: {
          id: evidenceId,
          missaoId: missao_id,
          r2Key: finalR2Key,
          imageHash: image_hash,
          repetida: isRepetida,
          enviadaEm: nowStr
        }
      }
    });

  } catch (error) {
    console.error("Commit reference error:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
