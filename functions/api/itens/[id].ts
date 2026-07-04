import { initDb, Env } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const idStr = params.id as string;
    const id = parseInt(idStr, 10);

    if (isNaN(id)) {
      return Response.json({
        success: false,
        error: "Invalid or missing ID",
        route: request.url
      }, { status: 400 });
    }

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      await env.DB.prepare(
        "UPDATE itens SET certificacao_id = ?, grupo_id = ?, ordem = ?, descricao = ?, critico = ?, obrigatorio = ?, ativo = ? WHERE id = ?"
      ).bind(
        data.certificacao,
        data.grupo || '',
        data.ordem,
        data.descricao,
        data.critico ? 1 : 0,
        data.obrigatorio ? 1 : 0,
        data.ativo ? 1 : 0,
        id
      ).run();

      return Response.json({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM itens WHERE id = ?").bind(id).run();
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
