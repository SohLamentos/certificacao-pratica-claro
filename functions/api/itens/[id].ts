import { initDb, Env } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  await initDb(env.DB);
  const idStr = params.id as string;
  const id = parseInt(idStr, 10);

  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: "Invalid or missing ID" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'PUT') {
    try {
      const data = await request.json() as any;
      await env.DB.prepare(
        "UPDATE itens SET certificacao = ?, grupo = ?, ordem = ?, descricao = ?, critico = ?, obrigatorio = ?, ativo = ? WHERE id = ?"
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

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare("DELETE FROM itens WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
