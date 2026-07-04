import { initDb, Env } from '../_db';

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  await initDb(env.DB);
  const id = params.id as string;

  if (!id) {
    return Response.json({ error: "Missing ID" }, { status: 400 });
  }

  try {
    const data = await request.json() as any;
    await env.DB.prepare(
      "UPDATE cqs SET nome = ?, perfil = ?, cidadeBase = ?, status = ?, updatedAt = ? WHERE id = ?"
    ).bind(
      data.nome,
      data.perfil,
      data.cidadeBase,
      data.status,
      data.updatedAt || new Date().toISOString(),
      id
    ).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await initDb(env.DB);
  const id = params.id as string;

  if (!id) {
    return Response.json({ error: "Missing ID" }, { status: 400 });
  }

  try {
    await env.DB.prepare("DELETE FROM cqs WHERE id = ?").bind(id).run();
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
