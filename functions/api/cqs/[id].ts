import { initDb, Env, jsonResponse } from '../_db';

async function broadcastEvent(env: Env, event: any) {
  try {
    if (env.RealtimeHub) {
      const id = env.RealtimeHub.idFromName("global");
      const obj = env.RealtimeHub.get(id);
      await obj.fetch("http://localhost/broadcast", {
        method: "POST",
        body: JSON.stringify(event)
      });
    }
  } catch (err) {
    console.error("Error broadcasting event:", err);
  }
}

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

      if (statusUpper === 'INATIVO') {
        await broadcastEvent(env, {
          type: "AVALIADOR_ATUALIZADO",
          avaliadorId: id,
          status: "Inativo"
        });
      }

      return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM avaliadores WHERE id = ?").bind(id).run();
      await broadcastEvent(env, {
        type: "AVALIADOR_DELETADO",
        avaliadorId: id
      });
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

