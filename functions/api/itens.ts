import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare("SELECT * FROM itens ORDER BY ordem ASC").all();
  const mapped = results.map((row: any) => ({
    ...row,
    critico: row.critico === 1,
    obrigatorio: row.obrigatorio === 1,
    ativo: row.ativo === 1
  }));
  return Response.json(mapped);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await initDb(env.DB);
  try {
    const data = await request.json() as any;
    await env.DB.prepare(
      "INSERT INTO itens (id, certificacao, grupo, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      data.id,
      data.certificacao,
      data.grupo || '',
      data.ordem,
      data.descricao,
      data.critico ? 1 : 0,
      data.obrigatorio ? 1 : 0,
      data.ativo ? 1 : 0
    ).run();

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
