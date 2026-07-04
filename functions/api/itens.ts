import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM itens ORDER BY ordem ASC"
    ).all();

    const mapped = results.map((row: any) => ({
      id: row.id,
      certificacao: row.certificacao_id,
      grupo: row.grupo_id,
      ordem: row.ordem,
      descricao: row.descricao,
      critico: row.critico === 1,
      obrigatorio: row.obrigatorio === 1,
      ativo: row.ativo === 1
    }));

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
    await env.DB.prepare(
      "INSERT INTO itens (id, certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
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
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
