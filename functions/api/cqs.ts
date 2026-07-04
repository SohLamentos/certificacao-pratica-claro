import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare("SELECT * FROM cqs ORDER BY nome ASC").all();
  return Response.json(results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await initDb(env.DB);
  try {
    const data = await request.json() as any;
    await env.DB.prepare(
      "INSERT INTO cqs (id, nome, perfil, cidadeBase, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
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
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
