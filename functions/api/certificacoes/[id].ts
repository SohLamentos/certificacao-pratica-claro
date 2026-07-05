import { initDb, Env, jsonResponse } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const id = params.id as string;

    if (!id) {
      return jsonResponse({
        success: false,
        error: "Missing ID",
        route: request.url
      }, 400);
    }

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      await env.DB.prepare(
        "UPDATE certificacoes SET nome = ?, descricao = ?, perfil_permitido = ?, cor = ?, icone = ?, ativa = ? WHERE id = ? OR nome = ?"
      ).bind(
        data.nome,
        data.descricao || '',
        data.perfilPermitido,
        data.cor || '',
        data.icone || '',
        data.ativa ? 1 : 0,
        id,
        id
      ).run();

      return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM certificacoes WHERE id = ? OR nome = ?").bind(id, id).run();
      return jsonResponse({ success: true });
    }

    return jsonResponse({
      success: false,
      error: "Method not allowed",
      route: request.url
    }, 405);

  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

