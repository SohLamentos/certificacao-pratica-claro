import { initDb, Env } from '../_db';

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  await initDb(env.DB);
  const id = params.id as string;

  if (!id) {
    return Response.json({ error: "Missing ID" }, { status: 400 });
  }

  try {
    const data = await request.json() as any;
    const responsesStr = JSON.stringify(data.checklistResponses || {});
    const resultadoStr = data.resultado ? JSON.stringify(data.resultado) : null;

    await env.DB.prepare(
      `UPDATE avaliacoes SET 
        nomeTecnico = ?, matricula = ?, empresa = ?, cidadeBase = ?, nomeCQ = ?, 
        data = ?, tipoCertificacao = ?, status = ?, checklistResponses = ?, 
        resultado = ?, observacao = ?, notaTeorica = ?, updatedAt = ? 
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
      responsesStr,
      resultadoStr,
      data.observacao || '',
      data.notaTeorica !== undefined && data.notaTeorica !== null ? Number(data.notaTeorica) : null,
      data.updatedAt || new Date().toISOString(),
      id
    ).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await initDb(env.DB);
  const id = params.id as string;

  if (!id) {
    return Response.json({ error: "Missing ID" }, { status: 400 });
  }

  try {
    await env.DB.prepare("DELETE FROM avaliacoes WHERE id = ?").bind(id).run();
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
