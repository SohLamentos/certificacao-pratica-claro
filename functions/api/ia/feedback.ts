import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const etapa = url.searchParams.get('etapa');

    let query = "SELECT * FROM ia_feedback_treinamento";
    let params: any[] = [];

    if (etapa) {
      query += " WHERE etapa = ?";
      params.push(etapa);
    }

    query += " ORDER BY created_at DESC";

    const stmt = env.DB.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    return jsonResponse({ success: true, feedback: results || [] });
  } catch (err: any) {
    console.error("GET ia/feedback error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao buscar feedbacks." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;

    const { 
      evidencia_id, 
      etapa, 
      resultado_original_ia, 
      resultado_final_cq, 
      motivo_divergencia, 
      usar_como_exemplo,
      usuario_id,
      perfil_usuario,
      // Support new field names in incoming body too
      image_hash: bodyImageHash,
      resultado_ia,
      resultado_cq,
      correcao_cq,
      motivo_cq,
      checklist_item,
      created_by
    } = body;

    if (!evidencia_id) {
      return jsonResponse({ success: false, error: "O campo 'evidencia_id' é obrigatório." }, 400);
    }

    const finalUserId = usuario_id || created_by || "cq_user";
    const finalPerfil = perfil_usuario || "cq";

    // Lookup evidence to populate missing fields automatically
    const ev = await env.DB.prepare(
      "SELECT ia_hash_arquivo, resultado_ia, etapa FROM ia_evidencias WHERE id = ?"
    ).bind(evidencia_id).first() as any;

    const finalImageHash = bodyImageHash || (ev ? ev.ia_hash_arquivo : null);
    const finalEtapa = etapa || checklist_item || (ev ? ev.etapa : "");
    const finalResultadoOriginalIa = resultado_original_ia || resultado_ia || (ev ? ev.resultado_ia : "PENDENTE");
    const finalResultadoFinalCq = resultado_final_cq || resultado_cq || "";
    const finalMotivoDivergencia = motivo_divergencia || correcao_cq || motivo_cq || "";
    const usarExemploInt = (usar_como_exemplo === true || usar_como_exemplo === 1 || usar_como_exemplo === undefined) ? 1 : 0;

    // Generate login_hash using Web Crypto API
    if (!env.LGPD_HASH_SALT) {
      return jsonResponse({
        success: false,
        error: "Configuração Ausente",
        message: "Erro de Configuração: A chave LGPD_HASH_SALT não foi configurada no ambiente."
      }, 500);
    }
    const salt = env.LGPD_HASH_SALT;
    const input = `${finalUserId}:${salt}`;
    const enc = new TextEncoder();
    const hashData = enc.encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO ia_feedback_treinamento (
        id, evidencia_id, image_hash, resultado_ia, resultado_cq, correcao_cq, motivo_cq,
        checklist_item, created_by, etapa, resultado_original_ia, resultado_final_cq,
        motivo_divergencia, usar_como_exemplo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      evidencia_id,
      finalImageHash,
      finalResultadoOriginalIa,
      finalResultadoFinalCq,
      finalMotivoDivergencia, // correcao_cq
      finalMotivoDivergencia, // motivo_cq
      finalEtapa, // checklist_item
      finalUserId,
      finalEtapa,
      finalResultadoOriginalIa,
      finalResultadoFinalCq,
      finalMotivoDivergencia,
      usarExemploInt
    ).run();

    // Log in ia_auditoria
    await env.DB.prepare(`
      INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      0, // General audit
      evidencia_id,
      "FEEDBACK_TREINAMENTO_CRIADO",
      JSON.stringify({ etapa: finalEtapa, resultado_final_cq: finalResultadoFinalCq, motivo_divergencia: finalMotivoDivergencia }),
      finalUserId,
      finalPerfil,
      login_hash
    ).run();

    return jsonResponse({ success: true, id });
  } catch (err: any) {
    console.error("POST ia/feedback error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao salvar feedback." }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;
    const { id, usar_como_exemplo } = body;

    if (!id) {
      return jsonResponse({ success: false, error: "ID é obrigatório para atualização." }, 400);
    }

    const usarExemploInt = (usar_como_exemplo === true || usar_como_exemplo === 1) ? 1 : 0;

    await env.DB.prepare(`
      UPDATE ia_feedback_treinamento
      SET usar_como_exemplo = ?
      WHERE id = ?
    `).bind(usarExemploInt, id).run();

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("PUT ia/feedback error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao atualizar feedback." }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ success: false, error: "ID é obrigatório para exclusão." }, 400);
    }

    await env.DB.prepare(`
      DELETE FROM ia_feedback_treinamento WHERE id = ?
    `).bind(id).run();

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("DELETE ia/feedback error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao excluir feedback." }, 500);
  }
};
