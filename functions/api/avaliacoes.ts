import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare("SELECT * FROM avaliacoes ORDER BY createdAt DESC").all();
  const mapped = results.map((row: any) => {
    let responses = {};
    let resObj = null;
    try {
      if (row.checklistResponses) {
        responses = JSON.parse(row.checklistResponses);
      }
    } catch (e) {
      console.error("Error parsing checklistResponses for", row.id, e);
    }
    try {
      if (row.resultado) {
        resObj = JSON.parse(row.resultado);
      }
    } catch (e) {
      console.error("Error parsing resultado for", row.id, e);
    }

    return {
      ...row,
      checklistResponses: responses,
      resultado: resObj,
      notaTeorica: row.notaTeorica !== null ? Number(row.notaTeorica) : undefined
    };
  });

  return Response.json(mapped);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await initDb(env.DB);
  try {
    const data = await request.json() as any;
    const responsesStr = JSON.stringify(data.checklistResponses || {});
    const resultadoStr = data.resultado ? JSON.stringify(data.resultado) : null;

    await env.DB.prepare(
      `INSERT INTO avaliacoes (
        id, nomeTecnico, matricula, empresa, cidadeBase, nomeCQ, data, 
        tipoCertificacao, status, checklistResponses, resultado, observacao, 
        notaTeorica, createdAt, updatedAt
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
      responsesStr,
      resultadoStr,
      data.observacao || '',
      data.notaTeorica !== undefined && data.notaTeorica !== null ? Number(data.notaTeorica) : null,
      data.createdAt || new Date().toISOString(),
      data.updatedAt || new Date().toISOString()
    ).run();

    return Response.json({ success: true, id: data.id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
