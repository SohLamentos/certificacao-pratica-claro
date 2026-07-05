import { initDb, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM avaliadores ORDER BY nome ASC"
    ).all();

    const mapped = results.map((row: any) => {
      const statusUpper = (row.status || '').toUpperCase();
      const mappedStatus = statusUpper === 'INATIVO' || row.ativo === 0 ? 'Inativo' : 'Ativo';
      return {
        id: String(row.id),
        nome: row.nome,
        perfil: row.perfil,
        cidadeBase: row.cidade_base || '',
        status: mappedStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return jsonResponse(mapped);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    
    const parts = (data.cidadeBase || '').split(' - ');
    const cidade = parts[0] || '';
    const base = parts[1] || '';
    const statusUpper = (data.status || 'Ativo').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
    const ativoVal = statusUpper === 'ATIVO' ? 1 : 0;

    const result = await env.DB.prepare(
      "INSERT INTO avaliadores (nome, perfil, cidade, base, cidade_base, ativo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(
      data.nome,
      data.perfil,
      cidade,
      base,
      data.cidadeBase || '',
      ativoVal,
      statusUpper
    ).run();

    const lastId = result.meta?.last_row_id || (result as any).lastRowId || '';

    return jsonResponse({ success: true, id: String(lastId) });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

