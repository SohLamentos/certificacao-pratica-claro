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

      // Fetch the updated evaluation to return it
      const updatedRow = await env.DB.prepare(`
        SELECT a.*, c.nome as certificacao_nome
        FROM avaliacoes a
        LEFT JOIN certificacoes c ON a.certificacao_id = c.id
        WHERE a.id = ?
      `).bind(id).first() as any;

      if (!updatedRow) {
        return jsonResponse({ success: false, error: "Evaluation not found after update" }, 404);
      }

      // Fetch checklist responses
      const { results: resps } = await env.DB.prepare(
        "SELECT * FROM respostas WHERE avaliacao_id = ?"
      ).bind(id).all();

      const responsesObj: Record<number, string> = {};
      (resps || []).forEach((r: any) => {
        responsesObj[r.item_id] = r.resposta;
      });

      let resObj = null;
      try {
        if (updatedRow.resultado) {
          resObj = JSON.parse(updatedRow.resultado);
        }
      } catch (e) {
        console.error("Error parsing resultado for", updatedRow.id, e);
      }

      const mapped = {
        id: String(updatedRow.id),
        nomeTecnico: updatedRow.nome_tecnico,
        matricula: updatedRow.matricula,
        empresa: updatedRow.empresa,
        cidadeBase: updatedRow.cidade_base,
        nomeCQ: updatedRow.nome_cq,
        avaliadorId: updatedRow.avaliador_id ? String(updatedRow.avaliador_id) : undefined,
        data: updatedRow.data,
        tipoCertificacao: updatedRow.certificacao_nome || String(updatedRow.certificacao_id),
        status: updatedRow.status,
        checklistResponses: responsesObj,
        resultado: resObj,
        observacao: updatedRow.observacao || '',
        notaTeorica: updatedRow.nota_teorica !== null ? Number(updatedRow.nota_teorica) : undefined,
        notaPratica: updatedRow.nota_pratica !== null ? Number(updatedRow.nota_pratica) : undefined,
        createdAt: updatedRow.created_at,
        updatedAt: updatedRow.updated_at
      };

      return jsonResponse({ success: true, evaluation: mapped });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM avaliacoes WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(id).run();
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

