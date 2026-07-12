import { initDb, Env, jsonResponse } from '@/functions/api/_db';
import { getAppConfig } from '@/functions/api/_config';
import { checkRateLimit } from '@/functions/api/_ratelimit';
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

async function generatePreflightToken(env: Env, payload: any): Promise<string> {
  const secret = env.IMAGE_SIGNING_SECRET || "fallback_preflight_secret";
  const payloadStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const signature = await computeHMAC("evidence-preflight:" + payloadStr, secret);
  const base64Payload = btoa(unescape(encodeURIComponent(payloadStr)));
  return `${base64Payload}.${signature}`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const token = params.token as string;
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "";

    if (!token) {
      return jsonResponse({ success: false, error: "Token ausente" }, 400);
    }

    // 1. Fetch portal by token
    const portal = await env.DB.prepare(
      "SELECT * FROM portais_evidencias WHERE token_hash = ?"
    ).bind(token).first() as any;

    if (!portal) {
      return jsonResponse({ success: false, error: "Portal não encontrado ou inválido" }, 404);
    }

    const isClosed = portal.status === "BLOQUEADO" || portal.status === "EXPIRADO" || portal.status.startsWith("ENCERRADO_");
    if (isClosed) {
      return jsonResponse({
        success: false,
        error: "Portal Bloqueado",
        message: `Este portal está fechado/concluído e não aceita mais alterações. Motivo: ${portal.encerrado_motivo || "Avaliação encerrada"}`
      }, 403);
    }

    const now = new Date();
    const expDate = new Date(portal.expira_em);
    if (now > expDate) {
      return jsonResponse({
        success: false,
        error: "Portal Expirado",
        message: "Prazo limite de envio expirado"
      }, 403);
    }

    // Apply preflight rate limits
    const rateLimitPortal = await checkRateLimit(env, {
      key: `preflight:portal:${portal.id}`,
      limit: 10,
      durationSeconds: 60
    });
    if (!rateLimitPortal.allowed) {
      return jsonResponse({ success: false, error: "Limite de verificações de foto excedido no portal. Tente novamente em um minuto." }, 429);
    }

    const rateLimitEval = await checkRateLimit(env, {
      key: `preflight:eval:${portal.avaliacao_id}`,
      limit: 30,
      durationSeconds: 60
    });
    if (!rateLimitEval.allowed) {
      return jsonResponse({ success: false, error: "Limite de verificações de foto excedido para a avaliação. Tente novamente em um minuto." }, 429);
    }

    let data: any;
    try {
      data = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: "Payload JSON inválido" }, 400);
    }

    const { missaoId, imageHash, mimeType, tamanhoFinal, largura, altura } = data;

    if (!missaoId || !imageHash || !mimeType) {
      return jsonResponse({ success: false, error: "Parâmetros obrigatórios do preflight ausentes" }, 400);
    }

    // Validate imageHash format
    const sha256Regex = /^[a-fA-F0-9]{64}$/;
    if (!sha256Regex.test(imageHash)) {
      return jsonResponse({ success: false, error: "Formato do hash da imagem inválido. Deve ser SHA-256." }, 400);
    }

    // Validate MIME and size
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(mimeType)) {
      return jsonResponse({ success: false, error: "Tipo de arquivo inválido. Somente JPEG, PNG e WebP são suportados." }, 400);
    }

    const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
    if (tamanhoFinal > MAX_SIZE) {
      return jsonResponse({ success: false, error: "O tamanho do arquivo excede o limite de 1 MB." }, 400);
    }

    const avaliacao = await env.DB.prepare(
      "SELECT id, status, certificacao_id FROM avaliacoes WHERE id = ?"
    ).bind(portal.avaliacao_id).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação relacionada não encontrada" }, 404);
    }

    const evalStatus = String(avaliacao.status).toUpperCase();
    const finishedStatuses = ["APROVADA", "APROVADO", "REPROVADA", "REPROVADO", "CANCELADA", "CANCELADO", "NO_SHOW", "NOSHOW", "NO-SHOW"];
    if (finishedStatuses.includes(evalStatus)) {
      return jsonResponse({ success: false, error: "A avaliação relacionada já foi concluída/fechada." }, 400);
    }

    const mission = await env.DB.prepare(
      "SELECT id, nome, certificacao_id, ativa FROM missoes_evidencias WHERE id = ?"
    ).bind(missaoId).first() as any;

    if (!mission) {
      return jsonResponse({ success: false, error: "Missão não localizada" }, 404);
    }

    if (mission.certificacao_id !== avaliacao.certificacao_id || mission.ativa !== 1) {
      return jsonResponse({ success: false, error: "A missão não pertence à certificação ou está inativa." }, 400);
    }

    // Register preflight execution metric (Requirement 10)
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: "EVIDENCIA_PREFLIGHT_EXECUTADO",
      usuario_id: "tecnico",
      perfil: "tecnico",
      ip: clientIp,
      userAgent,
      metadata: {
        portal_id: portal.id,
        avaliacao_id: portal.avaliacao_id,
        missao_id: missaoId,
        image_hash: imageHash
      }
    });

    const config = getAppConfig(env);

    if (!config.ENABLE_PREUPLOAD_DEDUPLICATION) {
      const preflightToken = await generatePreflightToken(env, {
        portal_id: portal.id,
        avaliacao_id: portal.avaliacao_id,
        missao_id: missaoId,
        image_hash: imageHash,
        action: "UPLOAD_REQUIRED",
        issued_at: Date.now(),
        expires_at: Date.now() + 5 * 60 * 1000,
        nonce: crypto.randomUUID()
      });

      return jsonResponse({
        success: true,
        data: {
          action: "UPLOAD_REQUIRED",
          uploadRequired: true,
          preflightToken
        }
      });
    }

    // Case 1: Same evaluation, same mission, same hash
    const existingIdempotent = await env.DB.prepare(`
      SELECT * FROM evidencias
      WHERE avaliacao_id = ? AND missao_id = ? AND image_hash = ?
      LIMIT 1
    `).bind(portal.avaliacao_id, missaoId, imageHash).first() as any;

    if (existingIdempotent) {
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EVIDENCIA_RETRY_IDEMPOTENTE",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missaoId,
          image_hash: imageHash,
          evidence_id: existingIdempotent.id
        }
      });

      return jsonResponse({
        success: true,
        data: {
          action: "REUSE_EXISTING_EVIDENCE",
          uploadRequired: false,
          evidencia: {
            id: existingIdempotent.id,
            missaoId: existingIdempotent.missao_id,
            r2Key: existingIdempotent.r2_key,
            imageHash: existingIdempotent.image_hash,
            repetida: existingIdempotent.repetida,
            enviadaEm: existingIdempotent.enviada_em
          }
        },
        message: "Esta evidência já foi recebida."
      });
    }

    // Case 2: Same evaluation, different mission, same hash
    const sameEvalHash = await env.DB.prepare(`
      SELECT r2_key, id, missao_id FROM evidencias
      WHERE avaliacao_id = ? AND image_hash = ? AND r2_key IS NOT NULL AND r2_key != ''
      LIMIT 1
    `).bind(portal.avaliacao_id, imageHash).first() as any;

    if (sameEvalHash) {
      // Query permite_reuso_mesma_imagem for both missions
      const currentMissionConf = await env.DB.prepare(
        "SELECT permite_reuso_mesma_imagem FROM missoes_evidencias WHERE id = ?"
      ).bind(missaoId).first() as any;

      const otherMissionConf = await env.DB.prepare(
        "SELECT permite_reuso_mesma_imagem FROM missoes_evidencias WHERE id = ?"
      ).bind(sameEvalHash.missao_id).first() as any;

      const allowsReuse = (currentMissionConf?.permite_reuso_mesma_imagem === 1) && (otherMissionConf?.permite_reuso_mesma_imagem === 1);

      if (!allowsReuse) {
        // Register duplicate block attempt in audit log
        await logEvent(env, {
          tipo: LogLevel.WARNING,
          evento: "IMAGEM_REPETIDA_ENTRE_MISSOES",
          usuario_id: "tecnico",
          perfil: "tecnico",
          ip: clientIp,
          userAgent,
          metadata: {
            portal_id: portal.id,
            avaliacao_id: portal.avaliacao_id,
            image_hash: imageHash,
            current_missao_id: missaoId,
            previous_missao_id: sameEvalHash.missao_id,
            allows_reuse_current: currentMissionConf?.permite_reuso_mesma_imagem,
            allows_reuse_other: otherMissionConf?.permite_reuso_mesma_imagem
          }
        });

        await logEvent(env, {
          tipo: LogLevel.AUDITORIA,
          evento: "REUSO_ENTRE_MISSOES_BLOQUEADO",
          usuario_id: "tecnico",
          perfil: "tecnico",
          ip: clientIp,
          userAgent,
          metadata: {
            portal_id: portal.id,
            avaliacao_id: portal.avaliacao_id,
            image_hash: imageHash,
            current_missao_id: missaoId,
            previous_missao_id: sameEvalHash.missao_id
          }
        });

        return jsonResponse({
          success: false,
          error: "Esta mesma foto já foi utilizada em outra missão. Envie uma evidência específica para esta atividade."
        }, 400);
      }

      // If authorized, create logical reference
      const preflightToken = await generatePreflightToken(env, {
        portal_id: portal.id,
        avaliacao_id: portal.avaliacao_id,
        missao_id: missaoId,
        image_hash: imageHash,
        action: "CREATE_LOGICAL_REFERENCE",
        issued_at: Date.now(),
        expires_at: Date.now() + 5 * 60 * 1000,
        nonce: crypto.randomUUID(),
        target_r2_key: sameEvalHash.r2_key,
        mime_type: mimeType,
        tamanho_final: tamanhoFinal,
        largura,
        altura
      });

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "REUSO_ENTRE_MISSOES_AUTORIZADO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          image_hash: imageHash,
          current_missao_id: missaoId,
          previous_missao_id: sameEvalHash.missao_id
        }
      });

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EVIDENCIA_UPLOAD_EVITADO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missaoId,
          image_hash: imageHash,
          saved_bytes: tamanhoFinal,
          reason: "CREATE_LOGICAL_REFERENCE"
        }
      });

      return jsonResponse({
        success: true,
        data: {
          action: "CREATE_LOGICAL_REFERENCE",
          uploadRequired: false,
          preflightToken
        }
      });
    }

    // Case 3: Same hash found in another evaluation
    const otherEvalHash = await env.DB.prepare(`
      SELECT r2_key, avaliacao_id FROM evidencias
      WHERE image_hash = ? AND r2_key IS NOT NULL AND r2_key != ''
      LIMIT 1
    `).bind(imageHash).first() as any;

    if (otherEvalHash) {
      const preflightToken = await generatePreflightToken(env, {
        portal_id: portal.id,
        avaliacao_id: portal.avaliacao_id,
        missao_id: missaoId,
        image_hash: imageHash,
        action: "UPLOAD_WITH_REUSE_ALERT",
        issued_at: Date.now(),
        expires_at: Date.now() + 5 * 60 * 1000,
        nonce: crypto.randomUUID(),
        target_r2_key: otherEvalHash.r2_key,
        repetida_avaliacao_id: otherEvalHash.avaliacao_id,
        mime_type: mimeType,
        tamanho_final: tamanhoFinal,
        largura,
        altura
      });

      // Register internal reuse alert: IMAGEM_REPETIDA_OUTRA_AVALIACAO (Requirement 3)
      await logEvent(env, {
        tipo: LogLevel.WARNING,
        evento: "IMAGEM_REPETIDA_OUTRA_AVALIACAO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missaoId,
          image_hash: imageHash,
          repetida_avaliacao_id: otherEvalHash.avaliacao_id
        }
      });

      await logEvent(env, {
        tipo: LogLevel.WARNING,
        evento: "IMAGEM_REPETIDA_DETECTADA",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missaoId,
          image_hash: imageHash,
          repetida_avaliacao_id: otherEvalHash.avaliacao_id
        }
      });

      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "EVIDENCIA_UPLOAD_EVITADO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          portal_id: portal.id,
          avaliacao_id: portal.avaliacao_id,
          missao_id: missaoId,
          image_hash: imageHash,
          saved_bytes: tamanhoFinal,
          reason: "UPLOAD_WITH_REUSE_ALERT"
        }
      });

      return jsonResponse({
        success: true,
        data: {
          action: "UPLOAD_WITH_REUSE_ALERT",
          uploadRequired: false,
          preflightToken,
          requiresReview: true
        }
      });
    }

    // Case 4: hash is new
    const preflightToken = await generatePreflightToken(env, {
      portal_id: portal.id,
      avaliacao_id: portal.avaliacao_id,
      missao_id: missaoId,
      image_hash: imageHash,
      action: "UPLOAD_REQUIRED",
      issued_at: Date.now(),
      expires_at: Date.now() + 5 * 60 * 1000,
      nonce: crypto.randomUUID(),
      mime_type: mimeType,
      tamanho_final: tamanhoFinal,
      largura,
      altura
    });

    return jsonResponse({
      success: true,
      data: {
        action: "UPLOAD_REQUIRED",
        uploadRequired: true,
        preflightToken
      }
    });

  } catch (error) {
    console.error("Preflight error:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
