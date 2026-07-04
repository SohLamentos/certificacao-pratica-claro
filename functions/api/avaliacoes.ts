import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results: avs } = await env.DB.prepare(
      "SELECT * FROM avaliacoes ORDER BY created_at DESC"
    ).all();

    const { results: resps } = await env.DB.prepare(
      "SELECT * FROM respostas"
    ).all();

    const answersMap = new Map<string, Record<number, string>>();
    resps.forEach((r: any) => {
      if (!answersMap.has(r.avaliacao_id)) {
        answersMap.set(r.avaliacao_id, {});
      }
      answersMap.get(r.avaliacao_id)![r.item_id] = r.resposta;
    });

    const mapped = avs.map((row: any) => {
      let resObj = null;
      try {
        if (row.resultado) {
          resObj = JSON.parse(row.resultado);
        }
      } catch (e) {
        console.error("Error parsing resultado for", row.id, e);
      }

      return {
        id: row.id,
        nomeTecnico: row.nome_tecnico,
        matricula: row.matricula,
        empresa: row.empresa,
        cidadeBase: row.cidade_base,
        nomeCQ: row.nome_cq,
        data: row.data,
        tipoCertificacao: row.certificacao_id,
        status: row.status,
        checklistResponses: answersMap.get(row.id) || {},
        resultado: resObj,
        observacao: row.observacao || '',
        notaTeorica: row.nota_teorica !== null ? Number(row.nota_teorica) : undefined,
        notaPratica: row.nota_pratica !== null ? Number(row.nota_pratica) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return Response.json(mapped);
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    const resultadoStr = data.resultado ? JSON.stringify(data.resultado) : null;
    const notaPrat = data.resultado?.nota !== undefined ? Number(data.resultado.nota) : null;

    // Check if tecnico exists, otherwise insert
    const tecExists = await env.DB.prepare("SELECT 1 FROM tecnicos WHERE matricula = ?").bind(data.matricula).first();
    if (!tecExists) {
      await env.DB.prepare(
        "INSERT INTO tecnicos (nome, matricula, empresa, cidade_base, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).bind(
        data.nomeTecnico,
        data.matricula,
        data.empresa,
        data.cidadeBase
      ).run();
    }

    // Insert evaluation
    await env.DB.prepare(
      `INSERT INTO avaliacoes (
        id, nome_tecnico, matricula, empresa, cidade_base, nome_cq, data, 
        certificacao_id, status, resultado, observacao, 
        nota_teorica, nota_pratica, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.id,
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
      data.createdAt || new Date().toISOString(),
      data.updatedAt || new Date().toISOString()
    ).run();

    // Insert responses
    await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(data.id).run();
    if (data.checklistResponses) {
      for (const [itemIdStr, resVal] of Object.entries(data.checklistResponses)) {
        const itemId = parseInt(itemIdStr, 10);
        await env.DB.prepare(
          "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
        ).bind(data.id, itemId, resVal).run();
      }
    }

    return Response.json({ success: true, id: data.id });
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
