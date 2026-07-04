import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT grupo as nome, certificacao FROM itens WHERE ativo = 1"
  ).all();
  return Response.json(results);
};
