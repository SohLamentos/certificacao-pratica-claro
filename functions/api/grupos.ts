import { initDb, Env } from './_db';

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

    return Response.json(mapped);
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
