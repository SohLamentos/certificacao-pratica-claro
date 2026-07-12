import { initDb, Env, jsonResponse } from '../../_db';
import { getAppConfig } from '../../_config';
import { applyRateLimit } from '../../_ratelimit';
import { logEvent, LogLevel } from '../../_logger';

// Helper to convert base64 to bytes
function base64ToUint8Array(base64String: string): Uint8Array {
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Compute HMAC for image signature
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  try {
    await initDb(env.DB);
    const token = params.token as string;

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

    // 2. Fetch evaluation
    const avaliacao = await env.DB.prepare(`
      SELECT a.*, c.nome as certificacao_nome
      FROM avaliacoes a
      LEFT JOIN certificacoes c ON a.certificacao_id = c.id
      WHERE a.id = ?
    `).bind(portal.avaliacao_id).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação relacionada não encontrada" }, 404);
    }

    // 3. Dynamic closing/expiration logic
    const now = new Date();
    const expDate = new Date(portal.expira_em);
    let currentStatus = portal.status;
    let encerradoEm = portal.encerrado_em;
    let encerradoMotivo = portal.encerrado_motivo;

    // A. Check if evaluation status is finalized
    const evalStatus = String(avaliacao.status).toUpperCase();
    if (evalStatus === "APROVADA" || evalStatus === "APROVADO") {
      currentStatus = "ENCERRADO_APROVADO";
      encerradoEm = encerradoEm || now.toISOString();
      encerradoMotivo = encerradoMotivo || "Avaliação aprovada e concluída";
    } else if (evalStatus === "REPROVADA" || evalStatus === "REPROVADO") {
      currentStatus = "ENCERRADO_REPROVADO";
      encerradoEm = encerradoEm || now.toISOString();
      encerradoMotivo = encerradoMotivo || "Avaliação reprovada e concluída";
    } else if (evalStatus === "CANCELADA" || evalStatus === "CANCELADO") {
      currentStatus = "ENCERRADO_CANCELADO";
      encerradoEm = encerradoEm || now.toISOString();
      encerradoMotivo = encerradoMotivo || "Avaliação cancelada";
    } else if (evalStatus === "NO_SHOW" || evalStatus === "NOSHOW" || evalStatus === "NO-SHOW") {
      currentStatus = "ENCERRADO_NOSHOW";
      encerradoEm = encerradoEm || now.toISOString();
      encerradoMotivo = encerradoMotivo || "Não comparecimento técnico (No Show)";
    } else if (currentStatus === "LIBERADO" && now > expDate) {
      // B. Check expiration
      currentStatus = "EXPIRADO";
      encerradoEm = now.toISOString();
      encerradoMotivo = "Prazo limite de envio expirado";
    }

    // Update portal status if changed dynamically
    if (currentStatus !== portal.status) {
      await env.DB.prepare(`
        UPDATE portais_evidencias
        SET status = ?, encerrado_em = ?, encerrado_motivo = ?, updated_at = ?
        WHERE id = ?
      `).bind(currentStatus, encerradoEm, encerradoMotivo, now.toISOString(), portal.id).run();
      portal.status = currentStatus;
      portal.encerrado_em = encerradoEm;
      portal.encerrado_motivo = encerradoMotivo;
    }

    // Log access
    await env.DB.prepare(`
      UPDATE portais_evidencias
      SET ultimo_acesso_em = ?, updated_at = ?
      WHERE id = ?
    `).bind(now.toISOString(), now.toISOString(), portal.id).run();

    // 4. Fetch Active Missions for this certification
    const { results: missoes } = await env.DB.prepare(`
      SELECT * FROM missoes_evidencias
      WHERE certificacao_id = ? AND ativa = 1
      ORDER BY ordem ASC
    `).bind(avaliacao.certificacao_id).all();

    // 5. Fetch currently uploaded evidences
    const { results: evidencias } = await env.DB.prepare(`
      SELECT * FROM evidencias
      WHERE portal_id = ?
      ORDER BY enviada_em ASC
    `).bind(portal.id).all();

    // 6. Check if LGPD consent has been accepted
    const lgpdRow = await env.DB.prepare(
      "SELECT id FROM ia_lgpd_aceite WHERE avaliacao_id = ?"
    ).bind(portal.avaliacao_id).first() as any;
    const hasAcceptedLgpd = !!lgpdRow;

    return jsonResponse({
      success: true,
      portal: {
        id: portal.id,
        status: portal.status,
        liberadoEm: portal.liberado_em,
        expiraEm: portal.expira_em,
        encerradoEm: portal.encerrado_em,
        encerradoMotivo: portal.encerrado_motivo,
        hasAcceptedLgpd
      },
      evaluation: {
        id: avaliacao.id,
        nomeTecnico: avaliacao.nome_tecnico,
        matricula: avaliacao.matricula,
        empresa: avaliacao.empresa,
        cidadeBase: avaliacao.cidade_base,
        certificacaoNome: avaliacao.certificacao_nome || "GPON",
        dataAvaliacao: avaliacao.data
      },
      missoes: missoes || [],
      evidencias: evidencias || []
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};

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

    // 1. Fetch portal
    const portal = await env.DB.prepare(
      "SELECT * FROM portais_evidencias WHERE token_hash = ?"
    ).bind(token).first() as any;

    if (!portal) {
      return jsonResponse({ success: false, error: "Portal não encontrado ou inválido" }, 404);
    }

    const isClosed = portal.status !== "LIBERADO" && portal.status !== "EM_ENVIO";
    const nowStr = new Date().toISOString();

    const data = await request.json() as any;
    const { action } = data;

    // ACTION: login
    if (action === "login") {
      const { matricula } = data;
      if (!matricula) {
        return jsonResponse({ success: false, error: "Matrícula é obrigatória" }, 400);
      }

      // Fetch evaluation to check matricula
      const avaliacao = await env.DB.prepare(
        "SELECT matricula, nome_tecnico FROM avaliacoes WHERE id = ?"
      ).bind(portal.avaliacao_id).first() as any;

      if (!avaliacao) {
        return jsonResponse({ success: false, error: "Avaliação relacionada não encontrada" }, 404);
      }

      const matchMatricula = String(matricula).trim().toUpperCase();
      const dbMatricula = String(avaliacao.matricula).trim().toUpperCase();

      if (matchMatricula !== dbMatricula) {
        return jsonResponse({ success: false, error: "Matrícula incorreta. Por favor, verifique seus dados." }, 401);
      }

      // Generate a secure, simple session hash using Web Crypto API
      if (!env.LGPD_HASH_SALT) {
        return jsonResponse({ success: false, error: "Chave LGPD_HASH_SALT não configurada" }, 500);
      }
      const salt = env.LGPD_HASH_SALT;
      const input = `${matchMatricula}:${salt}:${nowStr}`;
      const enc = new TextEncoder();
      const hashData = enc.encode(input);
      const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const sessionHash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

      return jsonResponse({
        success: true,
        sessionHash,
        nomeTecnico: avaliacao.nome_tecnico,
        message: "Acesso autenticado com sucesso."
      });
    }

    // ACTION: lgpd-accept
    if (action === "lgpd-accept") {
      const avaliacao = await env.DB.prepare(
        "SELECT id, matricula FROM avaliacoes WHERE id = ?"
      ).bind(portal.avaliacao_id).first() as any;

      if (!avaliacao) {
        return jsonResponse({ success: false, error: "Avaliação relacionada não encontrada" }, 404);
      }

      // Calculate stable technician login hash
      const salt = env.LGPD_HASH_SALT || "default_salt";
      const matchMatricula = String(avaliacao.matricula).trim().toUpperCase();
      const input = `${matchMatricula}:${salt}`;
      const enc = new TextEncoder();
      const hashData = enc.encode(input);
      const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const tecnico_login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

      // Insert acceptance
      const acceptId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO ia_lgpd_aceite (id, avaliacao_id, tecnico_login_hash, aceite_lgpd, aceite_lgpd_em, versao_termo)
        VALUES (?, ?, ?, 1, ?, 'v1')
      `).bind(acceptId, portal.avaliacao_id, tecnico_login_hash, nowStr).run();

      // Log audit event: PORTAL_LGPD_ACEITE
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAL_LGPD_ACEITE",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          avaliacao_id: portal.avaliacao_id,
          tecnico_login_hash,
          versao_termo: 'v1'
        }
      });

      return jsonResponse({
        success: true,
        message: "Aceite da LGPD registrado com sucesso."
      });
    }

    // BLOCK ALL UPLOADS / FINALIZES IF PORTAL IS CLOSED
    if (isClosed) {
      return jsonResponse({
        success: false,
        error: "Portal Bloqueado",
        message: `Este portal está fechado/concluído e não aceita mais alterações. Motivo: ${portal.encerrado_motivo || "Avaliação encerrada"}`
      }, 403);
    }

    // ACTION: upload
    if (action === "upload") {
      const {
        missaoId,
        arquivo_base64,
        mime_type,
        tamanho_original,
        tamanho_final,
        largura,
        altura,
        sessionHash
      } = data;

      if (!missaoId || !arquivo_base64 || !mime_type) {
        return jsonResponse({ success: false, error: "Parâmetros obrigatórios ausentes" }, 400);
      }

      // Check rate limit (Max 5 uploads per minute)
      const rateLimitRes = await applyRateLimit(env, "upload", portal.id);
      if (!rateLimitRes.allowed) {
        return jsonResponse({ success: false, error: "Limite de envio de fotos excedido. Máximo de 5 uploads por minuto." }, 429);
      }

      // Log audit event: PORTAL_AVISO_UPLOAD_CONFIRMADO
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAL_AVISO_UPLOAD_CONFIRMADO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          avaliacao_id: portal.avaliacao_id,
          portal_id: portal.id,
          missao_id: missaoId
        }
      });

      // Verify and resolve the R2 bucket
      let bucket: any = null;
      if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.put === 'function') {
        bucket = env.EVIDENCIAS_BUCKET;
      }
      if (!bucket) {
        return jsonResponse({ success: false, error: "Serviço de Armazenamento R2 não configurado (EVIDENCIAS_BUCKET)." }, 500);
      }

      const fileBytes = base64ToUint8Array(arquivo_base64);

      // Validate allowed mime types and size
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(mime_type)) {
        return jsonResponse({ success: false, error: "Tipo de arquivo inválido. Somente JPEG, PNG e WebP são suportados." }, 400);
      }

      const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
      if (fileBytes.length > MAX_SIZE) {
        return jsonResponse({ success: false, error: "O tamanho do arquivo excede o limite de 1 MB." }, 400);
      }

      // 1. Fetch evaluation and mission details
      const avaliacao = await env.DB.prepare(
        "SELECT id, tecnico_id, certificacao_id, nome_tecnico FROM avaliacoes WHERE id = ?"
      ).bind(portal.avaliacao_id).first() as any;

      const mission = await env.DB.prepare(
        "SELECT nome FROM missoes_evidencias WHERE id = ?"
      ).bind(missaoId).first() as any;

      if (!avaliacao || !mission) {
        return jsonResponse({ success: false, error: "Avaliação ou Missão não localizada" }, 404);
      }

      // 2. Generate SHA-256 for duplicate detection
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const image_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 3. IDEMPOTENCY: Check if exactly this evidence (evaluation, mission, image_hash) was already uploaded
      const existingIdempotent = await env.DB.prepare(`
        SELECT * FROM evidencias
        WHERE avaliacao_id = ? AND missao_id = ? AND image_hash = ?
        LIMIT 1
      `).bind(portal.avaliacao_id, missaoId, image_hash).first() as any;

      if (existingIdempotent) {
        // Return success with reused: true (Requirement 3)
        return jsonResponse({
          success: true,
          reused: true,
          data: {
            evidencia: {
              id: existingIdempotent.id,
              missaoId: existingIdempotent.missao_id,
              r2Key: existingIdempotent.r2_key,
              imageHash: existingIdempotent.image_hash,
              repetida: existingIdempotent.repetida,
              enviadaEm: existingIdempotent.enviada_em
            },
            reused: true
          },
          evidence: {
            id: existingIdempotent.id,
            missaoId: existingIdempotent.missao_id,
            r2Key: existingIdempotent.r2_key,
            imageHash: existingIdempotent.image_hash,
            repetida: existingIdempotent.repetida,
            enviadaEm: existingIdempotent.enviada_em
          },
          message: "Evidência já havia sido recebida."
        });
      }

      // Generate Image Signature
      const config = getAppConfig(env);
      if (!config.IMAGE_SIGNING_SECRET) {
        return jsonResponse({ success: false, error: "Chave IMAGE_SIGNING_SECRET não configurada" }, 500);
      }
      const image_signature = await computeHMAC(`${image_hash}:tecnico:${portal.avaliacao_id}`, config.IMAGE_SIGNING_SECRET);

      // Check duplicate in standard evidencias table
      const duplicateRow = await env.DB.prepare(`
        SELECT r2_key, portal_id, avaliacao_id FROM evidencias
        WHERE image_hash = ? AND r2_key IS NOT NULL AND r2_key != ''
        LIMIT 1
      `).bind(image_hash).first() as any;

      let r2_key = '';
      let isReusedAsset = false;
      let repetida = 0;
      let repetida_avaliacao_id = null;

      if (duplicateRow) {
        r2_key = duplicateRow.r2_key;
        isReusedAsset = true;
        repetida = 1;
        repetida_avaliacao_id = duplicateRow.avaliacao_id;
      } else {
        // Upload brand new file to R2
        const timestamp = Date.now();
        const uuid = crypto.randomUUID();
        const ext = mime_type === 'image/jpeg' ? 'jpg' : mime_type === 'image/png' ? 'png' : 'webp';
        r2_key = `portais/${portal.id}/${missaoId}/${timestamp}-${uuid}.${ext}`;

        try {
          await bucket.put(r2_key, fileBytes, {
            httpMetadata: { contentType: mime_type }
          });
        } catch (uploadErr) {
          console.error("R2 Upload Error:", uploadErr);
          return jsonResponse({ success: false, error: "Erro ao salvar a foto no bucket R2." }, 500);
        }
      }

      // Prepare Database changes
      const existingEvId = await env.DB.prepare(
        "SELECT id, r2_key, image_hash FROM evidencias WHERE portal_id = ? AND missao_id = ?"
      ).bind(portal.id, missaoId).first() as any;

      const evidenceId = existingEvId ? existingEvId.id : crypto.randomUUID();

      let oldHashToClean: string | null = null;
      let oldR2KeyToClean: string | null = null;
      let shouldDeleteOldRef = false;
      let newOldRefCount = 0;

      if (existingEvId && existingEvId.image_hash && existingEvId.image_hash !== image_hash) {
        oldHashToClean = existingEvId.image_hash;
        oldR2KeyToClean = existingEvId.r2_key;
        const refRow = await env.DB.prepare(
          "SELECT ref_count FROM image_ref_counts WHERE image_hash = ?"
        ).bind(oldHashToClean).first() as { ref_count: number } | null;

        if (refRow) {
          newOldRefCount = Math.max(0, refRow.ref_count - 1);
          if (newOldRefCount === 0) {
            shouldDeleteOldRef = true;
          }
        }
      }

      // Build D1 batch statements to ensure strict atomicity
      const statements = [];

      // 1. Decrement old file reference
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

      // 2. Increment new file reference
      statements.push(
        env.DB.prepare(`
          INSERT INTO image_ref_counts (image_hash, r2_key, ref_count, last_used_at)
          VALUES (?, ?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(image_hash) DO UPDATE SET
            ref_count = ref_count + 1,
            last_used_at = CURRENT_TIMESTAMP
        `).bind(image_hash, r2_key)
      );

      // 3. Save into standard evidences table
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
          missaoId,
          sessionHash || null,
          r2_key,
          image_hash,
          image_signature,
          mime_type,
          tamanho_original || null,
          tamanho_final || null,
          largura || null,
          altura || null,
          repetida,
          repetida_avaliacao_id,
          nowStr,
          nowStr,
          nowStr
        )
      );

      // 4. Update portal state to EM_ENVIO
      statements.push(
        env.DB.prepare(`
          UPDATE portais_evidencias
          SET status = 'EM_ENVIO', updated_at = ?
          WHERE id = ?
        `).bind(nowStr, portal.id)
      );

      // Execute atomic transaction batch
      try {
        await (env.DB as any).batch(statements);
      } catch (txError: any) {
        console.error("D1 Transaction Batch Error:", txError);

        // COMPENSATING ROLLBACK: delete newly uploaded file from R2 to prevent orphans
        if (!isReusedAsset) {
          try {
            await bucket.delete(r2_key);
            console.log(`Compensated R2: deleted brand new file ${r2_key} due to D1 transaction failure.`);
          } catch (delErr) {
            console.error("Failed to delete orphan file from R2 after D1 rollback:", delErr);
          }
        }

        // Register technical error only in app_logs (Requirement 7)
        try {
          await logEvent(env, {
            tipo: LogLevel.ERROR,
            evento: "PORTAL_UPLOAD_TX_FALHA",
            usuario_id: "tecnico",
            perfil: "tecnico",
            ip: clientIp,
            userAgent,
            metadata: {
              error: txError.message || String(txError),
              portal_id: portal.id,
              missao_id: missaoId,
              image_hash
            }
          });
        } catch (logErr) {
          console.error("Failed to log transaction error to app_logs:", logErr);
        }

        // Return user friendly message (Requirement 7)
        return jsonResponse({
          success: false,
          error: "Não foi possível concluir o envio. A foto pode já ter sido recebida. Atualize a tela antes de tentar novamente.",
          message: txError.message || String(txError)
        }, 500);
      }

      // Cleanup old replaced file from R2 if database transaction succeeded
      if (shouldDeleteOldRef && oldR2KeyToClean) {
        try {
          await bucket.delete(oldR2KeyToClean);
          console.log(`Cleaned up old replaced R2 file: ${oldR2KeyToClean}`);
        } catch (delErr) {
          console.error("Error deleting old replaced photo from R2:", delErr);
        }
      }

      // MIRROR UPLOAD INTO `ia_evidencias` for instant back-office & AI analysis capability!
      // This is an optional step. If it fails, we keep the upload concluded and do NOT return 500.
      try {
        const targetStage = mission.nome;
        const fileUrl = `/api/ia/evidencias/file?key=${encodeURIComponent(r2_key)}`;

        const existingIa = await env.DB.prepare(
          "SELECT id FROM ia_evidencias WHERE certificacao_id = ? AND etapa = ?"
        ).bind(portal.avaliacao_id, targetStage).first() as any;

        const iaEvId = existingIa ? existingIa.id : crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO ia_evidencias (id, certificacao_id, etapa, tipo_arquivo, arquivo_url, arquivo_key, status_ia, resultado_ia, justificativa_ia, confianca_ia, decisao_cq, observacao_cq, ia_modelo, ia_custo_estimado, ia_hash_arquivo, image_signature, ia_origem, imagem_repetida, imagem_repetida_alerta, risco_reuso, usuario_upload_id, perfil_upload, login_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?, 'MANUAL', ?, ?, ?, ?, 'tecnico', ?, ?, ?)
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
          mime_type,
          fileUrl,
          r2_key,
          image_hash,
          image_signature,
          repetida,
          repetida ? `Imagem idêntica detectada na avaliação de ID: ${repetida_avaliacao_id}` : null,
          repetida ? 'ALTO' : 'BAIXO',
          avaliacao.tecnico_id ? String(avaliacao.tecnico_id) : 'tecnico',
          sessionHash || '',
          nowStr,
          nowStr
        ).run();
      } catch (iaError: any) {
        console.error("Non-blocking IA Evidence mirroring error:", iaError);
        // Only log to app_logs, do not return 500
        try {
          await logEvent(env, {
            tipo: LogLevel.WARNING,
            evento: "PORTAL_UPLOAD_IA_SYNC_FALHA",
            usuario_id: "tecnico",
            perfil: "tecnico",
            ip: clientIp,
            userAgent,
            metadata: {
              error: iaError.message || String(iaError),
              portal_id: portal.id,
              missao_id: missaoId,
              image_hash
            }
          });
        } catch (logErr) {
          console.error("Failed to log optional sync failure:", logErr);
        }
      }

      // Log successful upload audit event
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAL_UPLOAD_CONCLUIDO",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          avaliacao_id: portal.avaliacao_id,
          portal_id: portal.id,
          missao_id: missaoId,
          image_hash
        }
      });

      return jsonResponse({
        success: true,
        data: {
          status: "AGUARDANDO_ANALISE",
          evidencia: {
            id: evidenceId,
            missaoId,
            r2Key: r2_key,
            imageHash: image_hash,
            repetida,
            enviadaEm: nowStr
          }
        },
        evidence: {
          id: evidenceId,
          missaoId,
          r2Key: r2_key,
          imageHash: image_hash,
          repetida,
          enviadaEm: nowStr
        }
      });
    }

    // ACTION: finalize
    if (action === "finalize") {
      // Set status to EVIDENCIAS_ENVIADAS and record timestamp
      await env.DB.prepare(`
        UPDATE portais_evidencias
        SET status = 'EVIDENCIAS_ENVIADAS',
            encerrado_em = ?,
            encerrado_motivo = 'Envio finalizado pelo técnico',
            updated_at = ?
        WHERE id = ?
      `).bind(nowStr, nowStr, portal.id).run();

      // Trigger automatic back-office transition to AGUARDANDO_ANALISE or similar
      const avaliacao = await env.DB.prepare(
        "SELECT id, status FROM avaliacoes WHERE id = ?"
      ).bind(portal.avaliacao_id).first() as any;

      if (avaliacao && (avaliacao.status === "EM_ANDAMENTO" || avaliacao.status === "AGENDADO")) {
        await env.DB.prepare(`
          UPDATE avaliacoes
          SET status = 'AGUARDANDO_ANALISE', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(portal.avaliacao_id).run();
      }

      // Log audit event: PORTAL_EVIDENCIAS_FINALIZADAS
      await logEvent(env, {
        tipo: LogLevel.AUDITORIA,
        evento: "PORTAL_EVIDENCIAS_FINALIZADAS",
        usuario_id: "tecnico",
        perfil: "tecnico",
        ip: clientIp,
        userAgent,
        metadata: {
          avaliacao_id: portal.avaliacao_id,
          portal_id: portal.id
        }
      });

      return jsonResponse({
        success: true,
        message: "Evidências finalizadas e enviadas com sucesso ao CQ para avaliação."
      });
    }

    return jsonResponse({ success: false, error: "Ação inválida" }, 400);

  } catch (error) {
    console.error("Portal action error:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
