import { initDb, Env } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  await initDb(env.DB);
  const { results } = await env.DB.prepare("SELECT * FROM cqs ORDER BY nome ASC").all();
  return Response.json(results);
};
