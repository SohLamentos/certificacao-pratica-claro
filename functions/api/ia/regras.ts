import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const rules = await env.DB.prepare(
      "SELECT * FROM ia_regras_itens ORDER BY created_at DESC"
    ).all();

    return jsonResponse({
      success: true,
      rules: rules.results || []
    });
  } catch (err: any) {
    console.error("GET ia_regras_itens error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao buscar regras da IA." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;

    const {
      tipo_certificacao,
      etapa,
      titulo,
      descricao,
      criterios_conformidade,
      criterios_nao_conformidade,
      exemplos_conformes,
      exemplos_nao_conformes,
      peso,
      ativo
    } = body;

    if (!etapa || !titulo) {
      return jsonResponse({ success: false, error: "Etapa e Título são obrigatórios." }, 400);
    }

    const id = crypto.randomUUID();
    const isAtivo = (ativo === true || ativo === 1) ? 1 : 0;
    const rulePeso = typeof peso === 'number' ? peso : 1;

    await env.DB.prepare(`
      INSERT INTO ia_regras_itens (
        id, tipo_certificacao, etapa, titulo, descricao, criterios_conformidade,
        criterios_nao_conformidade, exemplos_conformes, exemplos_nao_conformes,
        peso, ativo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      id,
      tipo_certificacao || null,
      etapa,
      titulo,
      descricao || null,
      criterios_conformidade || null,
      criterios_nao_conformidade || null,
      exemplos_conformes || null,
      exemplos_nao_conformes || null,
      rulePeso,
      isAtivo
    ).run();

    return jsonResponse({ success: true, id });
  } catch (err: any) {
    console.error("POST ia_regras_itens error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao criar regra da IA." }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;

    const {
      id,
      tipo_certificacao,
      etapa,
      titulo,
      descricao,
      criterios_conformidade,
      criterios_nao_conformidade,
      exemplos_conformes,
      exemplos_nao_conformes,
      peso,
      ativo
    } = body;

    if (!id || !etapa || !titulo) {
      return jsonResponse({ success: false, error: "ID, Etapa e Título são obrigatórios." }, 400);
    }

    const isAtivo = (ativo === true || ativo === 1) ? 1 : 0;
    const rulePeso = typeof peso === 'number' ? peso : 1;

    await env.DB.prepare(`
      UPDATE ia_regras_itens
      SET tipo_certificacao = ?,
          etapa = ?,
          titulo = ?,
          descricao = ?,
          criterios_conformidade = ?,
          criterios_nao_conformidade = ?,
          exemplos_conformes = ?,
          exemplos_nao_conformes = ?,
          peso = ?,
          ativo = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      tipo_certificacao || null,
      etapa,
      titulo,
      descricao || null,
      criterios_conformidade || null,
      criterios_nao_conformidade || null,
      exemplos_conformes || null,
      exemplos_nao_conformes || null,
      rulePeso,
      isAtivo,
      id
    ).run();

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("PUT ia_regras_itens error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao atualizar regra da IA." }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ success: false, error: "ID é obrigatório." }, 400);
    }

    await env.DB.prepare("DELETE FROM ia_regras_itens WHERE id = ?").bind(id).run();

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("DELETE ia_regras_itens error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao excluir regra da IA." }, 500);
  }
};
