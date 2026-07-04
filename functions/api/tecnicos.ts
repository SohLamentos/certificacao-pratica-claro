import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT nome as nomeTecnico, matricula, empresa, cidade_base as cidadeBase FROM tecnicos ORDER BY nome ASC"
    ).all();
    return Response.json(results);
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
