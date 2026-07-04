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
      const parts = (data.cidadeBase || '').split(' - ');
      const cidade = parts[0] || '';
      const base = parts[1] || '';
      const statusUpper = (data.status || 'Ativo').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
      const ativoVal = statusUpper === 'ATIVO' ? 1 : 0;

      await env.DB.prepare(
        "UPDATE avaliadores SET nome = ?, perfil = ?, cidade = ?, base = ?, cidade_base = ?, ativo = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(
        data.nome,
        data.perfil,
        cidade,
        base,
        data.cidadeBase || '',
        ativoVal,
        statusUpper,
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
