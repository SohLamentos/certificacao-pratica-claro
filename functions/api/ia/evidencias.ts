import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const certIdParam = url.searchParams.get("certificacao_id");

    if (!certIdParam) {
      return jsonResponse({ success: false, error: "Missing certificacao_id" }, 400);
    }

    // Retrieve evidence
    const { results: evidencias } = await env.DB.prepare(
      "SELECT * FROM ia_evidencias WHERE certificacao_id = ? ORDER BY created_at ASC"
    ).bind(certIdParam).all();

    // Retrieve audit logs
    const { results: auditorias } = await env.DB.prepare(
      "SELECT * FROM ia_auditoria WHERE certificacao_id = ? ORDER BY created_at DESC"
    ).bind(certIdParam).all();

    return jsonResponse({
      success: true,
      evidencias: evidencias || [],
      auditoria: auditorias || []
    });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;

    const {
      id,
      certificacao_id,
      etapa,
      decisao_cq,
      observacao_cq,
      is_cq_decision,
      usuario_id,
      perfil_usuario,
      usuario_nome
    } = data;

    if (!certificacao_id) {
      return jsonResponse({ success: false, error: "Missing certificacao_id" }, 400);
    }

    // Get current evaluation details
    const currentEval = await env.DB.prepare(
      "SELECT status FROM avaliacoes WHERE id = ?"
    ).bind(certificacao_id).first() as any;

    if (!currentEval) {
      return jsonResponse({ success: false, error: "Certificação não encontrada" }, 404);
    }

    if (is_cq_decision) {
      if (!id) {
        return jsonResponse({ success: false, error: "Missing evidence id for decision" }, 400);
      }

      const finalUserId = usuario_id || "cq_user";
      const finalPerfil = perfil_usuario || "cq";

      // Generate login_hash using Web Crypto API
      const salt = "claro_cq_lgpd_salt_2026";
      const input = `${finalUserId}:${salt}`;
      const enc = new TextEncoder();
      const hashData = enc.encode(input);
      const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

      // Update decision
      await env.DB.prepare(`
        UPDATE ia_evidencias 
        SET decisao_cq = ?, observacao_cq = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(decisao_cq, observacao_cq || '', id).run();

      // Log audit
      await env.DB.prepare(`
        INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        certificacao_id,
        id,
        "DECISAO_CQ",
        JSON.stringify({ decisao_cq, observacao_cq, etapa }),
        finalUserId,
        finalPerfil,
        login_hash
      ).run();

      // Check if all 7 mandatory stages have decisions (either APROVADO or REPROVADO)
      const { results: allEvs } = await env.DB.prepare(
        "SELECT etapa, status_ia, decisao_cq FROM ia_evidencias WHERE certificacao_id = ?"
      ).bind(certificacao_id).all();

      const mandatoryStages = [
        "Identificação do técnico",
        "Evidência da instalação física",
        "Evidência da ONT/equipamento",
        "Evidência dos níveis de sinal",
        "Evidência do Wi-Fi configurado",
        "Evidência de organização/acabamento",
        "Evidência final com cliente/local"
      ];

      const evsMap = new Map<string, any>();
      allEvs.forEach((e: any) => evsMap.set(e.etapa, e));

      let allResolved = true;
      let hasReprovado = false;

      for (const stage of mandatoryStages) {
        const ev = evsMap.get(stage);
        if (!ev) {
          allResolved = false;
        } else {
          const decision = ev.decisao_cq;
          if (!decision) {
            allResolved = false;
          } else if (decision === 'REPROVADA' || decision === 'Reprovar' || decision === 'REPROVADO') {
            hasReprovado = true;
          }
        }
      }

      if (allResolved) {
        const finalStatus = hasReprovado ? 'REPROVADA' : 'APROVADA';
        await env.DB.prepare(
          "UPDATE avaliacoes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(finalStatus, certificacao_id).run();
      }

      return jsonResponse({ success: true, evidenceId: id });
    }

    return jsonResponse({ success: false, error: "Invalid action" }, 400);
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
