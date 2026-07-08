import { initDb, Env, jsonResponse } from '../../_db';

export const onRequestDelete: PagesFunction<Env> = async ({ request, params, env }) => {
  try {
    await initDb(env.DB);
    const { id } = params;

    if (!id) {
      return jsonResponse({ success: false, error: "Missing evidence ID" }, 400);
    }

    const url = new URL(request.url);
    const usuario_id = url.searchParams.get("usuario_id") || "tecnico-user";
    const perfil_usuario = url.searchParams.get("perfil_usuario") || "tecnico";

    // Generate login_hash using Web Crypto API
    const salt = "claro_cq_lgpd_salt_2026";
    const input = `${usuario_id}:${salt}`;
    const enc = new TextEncoder();
    const hashData = enc.encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

    // Retrieve evidence details
    const evidence = await env.DB.prepare(
      "SELECT * FROM ia_evidencias WHERE id = ?"
    ).bind(id).first() as any;

    if (!evidence) {
      return jsonResponse({ success: false, error: "Evidência não encontrada." }, 404);
    }

    // 1. Apenas se ainda não houver decisão final do CQ
    if (evidence.decisao_cq && evidence.decisao_cq.trim() !== '') {
      return jsonResponse({ success: false, error: "Não é possível excluir evidência que já possui decisão do CQ." }, 403);
    }

    // 2. Remove file from R2 if applicable using Reference Counting
    if (evidence.arquivo_key) {
      let bucket: any = null;
      if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.delete === 'function') {
        bucket = env.EVIDENCIAS_BUCKET;
      }

      if (bucket) {
        try {
          if (evidence.ia_hash_arquivo) {
            // Retrieve current reference count
            const refRow = await env.DB.prepare(
              "SELECT ref_count FROM image_ref_counts WHERE image_hash = ?"
            ).bind(evidence.ia_hash_arquivo).first() as { ref_count: number } | null;

            if (refRow) {
              const newRefCount = Math.max(0, refRow.ref_count - 1);
              await env.DB.prepare(
                "UPDATE image_ref_counts SET ref_count = ? WHERE image_hash = ?"
              ).bind(newRefCount, evidence.ia_hash_arquivo).run();

              if (newRefCount === 0) {
                // No more references, safe to physically delete from R2
                await bucket.delete(evidence.arquivo_key);
                await env.DB.prepare(
                  "DELETE FROM image_ref_counts WHERE image_hash = ?"
                ).bind(evidence.ia_hash_arquivo).run();
              } else {
                console.info(`R2 File not deleted. Remaining references for hash ${evidence.ia_hash_arquivo}: ${newRefCount}`);
              }
            } else {
              // Fallback: delete if no ref count track exists
              await bucket.delete(evidence.arquivo_key);
            }
          } else {
            // Fallback: delete directly if no hash exists on evidence record
            await bucket.delete(evidence.arquivo_key);
          }
        } catch (delErr) {
          console.error("Error deleting file from R2:", delErr);
        }
      }
    }

    // 3. Remove record from ia_evidencias
    await env.DB.prepare(
      "DELETE FROM ia_evidencias WHERE id = ?"
    ).bind(id).run();

    // 4. Log auditoria
    await env.DB.prepare(`
      INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      evidence.certificacao_id,
      id,
      "EVIDENCIA_REMOVIDA",
      JSON.stringify({ etapa: evidence.etapa, arquivo_key: evidence.arquivo_key }),
      usuario_id,
      perfil_usuario,
      login_hash
    ).run();

    // 5. Update evaluation status if needed (e.g., if there are no more evidences)
    const { results: remaining } = await env.DB.prepare(
      "SELECT id FROM ia_evidencias WHERE certificacao_id = ?"
    ).bind(evidence.certificacao_id).all();

    if (remaining.length === 0) {
      // Revert evaluation status to AGENDADA if there are no more uploaded evidences
      const avaliacao = await env.DB.prepare(
        "SELECT status FROM avaliacoes WHERE id = ?"
      ).bind(evidence.certificacao_id).first() as any;

      if (avaliacao && avaliacao.status === 'EM_ANDAMENTO') {
        await env.DB.prepare(
          "UPDATE avaliacoes SET status = 'AGENDADA', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(evidence.certificacao_id).run();
      }
    }

    return jsonResponse({ success: true, message: "Evidência removida com sucesso." });
  } catch (error) {
    console.error("Delete evidence error:", error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
