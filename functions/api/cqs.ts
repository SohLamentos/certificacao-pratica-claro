import { Env, jsonResponse } from './_db';
import { CQRepository } from './_repositories';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const results = await CQRepository.getAllAvaliadores(env.DB);

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
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao recuperar avaliadores",
      message: error.message
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const data = await request.json() as any;
    if (!data.nome || !data.perfil) {
      return jsonResponse({ success: false, error: "Campos obrigatórios ausentes (nome, perfil)" }, 400);
    }
    const lastId = await CQRepository.createAvaliador(env.DB, data);
    return jsonResponse({ success: true, id: String(lastId) });
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao criar avaliador",
      message: error.message
    }, 500);
  }
};
