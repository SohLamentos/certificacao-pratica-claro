import { initDb, initCertificacoes, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initCertificacoes(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM certificacoes ORDER BY id"
    ).all();

    const mapped = results.map((row: any) => ({
      id: row.id,
      nome: row.nome,
      descricao: row.descricao,
      perfilPermitido: row.perfil_permitido,
      cor: row.cor,
      icone: row.icone,
      ativa: row.ativa === 1
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
      "INSERT INTO certificacoes (id, nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?, ?)"
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
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};
