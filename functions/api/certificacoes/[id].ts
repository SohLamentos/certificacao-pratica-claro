import { initDb, Env } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  await initDb(env.DB);
  const id = params.id as string;

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing ID" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'PUT') {
    try {
      const data = await request.json() as any;
      await env.DB.prepare(
        "UPDATE certificacoes SET nome = ?, descricao = ?, perfilPermitido = ?, cor = ?, icone = ?, ativa = ? WHERE id = ?"
      ).bind(
        data.nome,
        data.descricao || '',
        data.perfilPermitido,
        data.cor || '',
        data.icone || '',
        data.ativa ? 1 : 0,
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
      // Delete the certification
      await env.DB.prepare("DELETE FROM certificacoes WHERE id = ?").bind(id).run();
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
