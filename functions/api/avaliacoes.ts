import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results: avs } = await env.DB.prepare(`
      SELECT a.*, c.nome as certificacao_nome
      FROM avaliacoes a
      LEFT JOIN certificacoes c ON a.certificacao_id = c.id
      ORDER BY a.created_at DESC
    `).all();

    const { results: resps } = await env.DB.prepare(
      "SELECT * FROM respostas"
    ).all();

    const answersMap = new Map<string, Record<number, string>>();
    resps.forEach((r: any) => {
      const avIdStr = String(r.avaliacao_id);
      if (!answersMap.has(avIdStr)) {
        answersMap.set(avIdStr, {});
      }
      answersMap.get(avIdStr)![r.item_id] = r.resposta;
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
        id: String(row.id),
        nomeTecnico: row.nome_tecnico,
        matricula: row.matricula,
        empresa: row.empresa,
        cidadeBase: row.cidade_base,
        nomeCQ: row.nome_cq,
        data: row.data,
        tipoCertificacao: row.certificacao_nome || String(row.certificacao_id),
        status: row.status,
        checklistResponses: answersMap.get(String(row.id)) || {},
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
    } else {
      // Auto-create certification if it doesn't exist
      const insertCert = await env.DB.prepare(
        "INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, 1)"
      ).bind(data.tipoCertificacao, '', 'CQ ou Analista', '#E30613', 'Cpu').run();
      certId = insertCert.meta?.last_row_id || (insertCert as any).lastRowId || null;
    }

    // 4. Insert evaluation (omitting ID for AUTOINCREMENT)
    const result = await env.DB.prepare(
      `INSERT INTO avaliacoes (
        tecnico_id, nome_tecnico, matricula, empresa, cidade_base, 
        avaliador_id, nome_cq, data, certificacao_id, status, resultado, 
        observacao, nota_teorica, nota_pratica, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
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
      notaPrat
    ).run();

    const evalId = result.meta?.last_row_id || (result as any).lastRowId;

    // 5. Delete and insert responses
    await env.DB.prepare("DELETE FROM respostas WHERE avaliacao_id = ?").bind(evalId).run();
    if (data.checklistResponses) {
      for (const [itemIdStr, resVal] of Object.entries(data.checklistResponses)) {
        const itemId = parseInt(itemIdStr, 10);
        await env.DB.prepare(
          "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
        ).bind(evalId, itemId, resVal).run();
      }
    }

    return Response.json({ success: true, id: String(evalId) });
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
