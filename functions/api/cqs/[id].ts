import { initDb, Env } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const id = params.id as string;

    if (!id) {
      return Response.json({
        success: false,
        error: "Missing ID",
        route: request.url
      }, { status: 400 });
    }

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      await env.DB.prepare(
        "UPDATE avaliadores SET nome = ?, perfil = ?, cidade_base = ?, status = ?, updated_at = ? WHERE id = ?"
      ).bind(
        data.nome,
        data.perfil,
        data.cidadeBase,
        data.status,
        data.updatedAt || new Date().toISOString(),
        id
      ).run();

      return Response.json({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM avaliadores WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    return Response.json({
      success: false,
      error: "Method not allowed",
      route: request.url
    }, { status: 405 });

  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
