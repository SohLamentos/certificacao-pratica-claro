import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT nomeTecnico, matricula, empresa, cidadeBase FROM avaliacoes ORDER BY nomeTecnico ASC"
  ).all();
  return Response.json(results);
};
