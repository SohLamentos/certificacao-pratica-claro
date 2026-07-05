import { initDb, initCertificacoes, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initCertificacoes(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM certificacoes ORDER BY id"
    ).all();

    const mapped = results.map((row: any) => ({
      id: row.nome,
      nome: row.nome,
      descricao: row.descricao,
      perfilPermitido: row.perfil_permitido,
      cor: row.cor,
      icone: row.icone,
      ativa: row.ativa === 1
    }));

    return jsonResponse(mapped);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    const result = await env.DB.prepare(
      "INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      data.nome,
      data.descricao || '',
      data.perfilPermitido,
      data.cor || '',
      data.icone || '',
      data.ativa ? 1 : 0
    ).run();

    const lastId = result.meta?.last_row_id || (result as any).lastRowId;

    return jsonResponse({ success: true, id: String(lastId) });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

