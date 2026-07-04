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

      // 1. Resolve or insert Tecnico
      let tecId: number | null = null;
      const tecRow = await env.DB.prepare("SELECT id FROM tecnicos WHERE matricula = ?").bind(data.matricula).first();
      if (tecRow) {
        tecId = (tecRow as any).id;
      } else {
        const resultTec = await env.DB.prepare(
          "INSERT INTO tecnicos (nome, matricula, empresa, cidade_base, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ).bind(
          data.nomeTecnico,
          data.matricula,
          data.empresa,
          data.cidadeBase
        ).run();
        tecId = resultTec.meta?.last_row_id || (resultTec as any).lastRowId || null;
      }

      // 2. Resolve Avaliador
      let avaliadorId: number | null = null;
      const avRow = await env.DB.prepare("SELECT id FROM avaliadores WHERE nome = ?").bind(data.nomeCQ).first();
      if (avRow) {
        avaliadorId = (avRow as any).id;
      }

      // 3. Resolve Certificacao
      let certId: number | null = null;
      const certRow = await env.DB.prepare("SELECT id FROM certificacoes WHERE nome = ?").bind(data.tipoCertificacao).first();
      if (certRow) {
        certId = (certRow as any).id;
      }

      // Update evaluation
      await env.DB.prepare(
        `UPDATE avaliacoes SET 
          tecnico_id = ?, nome_tecnico = ?, matricula = ?, empresa = ?, cidade_base = ?, 
          avaliador_id = ?, nome_cq = ?, data = ?, certificacao_id = ?, status = ?, 
          resultado = ?, observacao = ?, nota_teorica = ?, nota_pratica = ?, 
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`
      ).bind(
        tecId,
        data.nomeTecnico,
        data.matricula,
        data.empresa,
        data.cidadeBase,
        avaliadorId,
        data.nomeCQ,
        data.data,
        certId,
        data.status,
        resultadoStr,
        data.observacao || '',
        data.notaTeorica !== undefined && data.notaTeorica !== null ? Number(data.notaTeorica) : null,
        notaPrat,
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
