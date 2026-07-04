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
      const resultadoStr = data.resultado ? JSON.stringify(data.resultado) : null;
      const notaPrat = data.resultado?.nota !== undefined ? Number(data.resultado.nota) : null;

      // Update evaluation
      await env.DB.prepare(
        `UPDATE avaliacoes SET 
          nome_tecnico = ?, matricula = ?, empresa = ?, cidade_base = ?, 
          nome_cq = ?, data = ?, certificacao_id = ?, status = ?, 
          resultado = ?, observacao = ?, nota_teorica = ?, nota_pratica = ?, 
          updated_at = ? 
        WHERE id = ?`
      ).bind(
        data.nomeTecnico,
        data.matricula,
        data.empresa,
        data.cidadeBase,
        data.nomeCQ,
        data.data,
        data.tipoCertificacao,
        data.status,
        resultadoStr,
        data.observacao || '',
        data.notaTeorica !== undefined && data.notaTeorica !== null ? Number(data.notaTeorica) : null,
        notaPrat,
        data.updatedAt || new Date().toISOString(),
        id
      ).run();

      // Sync responses table
      await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(id).run();
      if (data.checklistResponses) {
        for (const [itemIdStr, resVal] of Object.entries(data.checklistResponses)) {
          const itemId = parseInt(itemIdStr, 10);
          await env.DB.prepare(
            "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
          ).bind(id, itemId, resVal).run();
        }
      }

      return Response.json({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM avaliacoes WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(id).run();
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
