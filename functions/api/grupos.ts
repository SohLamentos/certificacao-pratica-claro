import { initDb, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT g.nome, c.nome as certificacao_nome FROM grupos g LEFT JOIN certificacoes c ON g.certificacao_id = c.id"
    ).all();

    const mapped = results.map((row: any) => ({
      nome: row.nome,
      certificacao: row.certificacao_nome || String(row.certificacao_id)
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

