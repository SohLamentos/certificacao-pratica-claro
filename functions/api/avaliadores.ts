import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM avaliadores ORDER BY nome ASC"
    ).all();

    const mapped = results.map((row: any) => ({
      id: row.id,
      nome: row.nome,
      perfil: row.perfil,
      cidadeBase: row.cidade_base,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    await env.DB.prepare(
      "INSERT INTO avaliadores (id, nome, perfil, cidade_base, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      data.id,
      data.nome,
      data.perfil,
      data.cidadeBase,
      data.status,
      data.createdAt || new Date().toISOString(),
      data.updatedAt || new Date().toISOString()
    ).run();

    return Response.json({ success: true, id: data.id });
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
