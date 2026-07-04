import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare("SELECT * FROM certificacoes").all();
  const mapped = results.map((row: any) => ({
    ...row,
    ativa: row.ativa === 1
  }));
  return Response.json(mapped);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await initDb(env.DB);
  try {
    const data = await request.json() as any;
    await env.DB.prepare(
      "INSERT INTO certificacoes (id, nome, descricao, perfilPermitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      data.id,
      data.nome,
      data.descricao || '',
      data.perfilPermitido,
      data.cor || '',
      data.icone || '',
      data.ativa ? 1 : 0
    ).run();

    return Response.json({ success: true, id: data.id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
};
