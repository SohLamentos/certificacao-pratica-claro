import { initDb, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT id, nome as nomeTecnico, matricula, empresa, cidade_base as cidadeBase FROM tecnicos ORDER BY nome ASC"
    ).all();
    return jsonResponse(results);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

