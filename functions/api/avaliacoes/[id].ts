import { Env, jsonResponse } from '../_db';
import { EvaluationService } from '../_services';
import { EvaluationRepository } from '../_repositories';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    const id = params.id as string;
    if (!id) {
      return jsonResponse({
        success: false,
        error: "ID ausente",
        message: "O identificador da avaliação é obrigatório."
      }, 400);
    }

    if (request.method === 'GET') {
  const evaluationRow = await EvaluationRepository.getById(env.DB, id);

  if (!evaluationRow) {
    return jsonResponse({
      success: false,
      error: 'Avaliação não encontrada',
      message: `Não foi encontrada uma avaliação com o ID ${id}.`
    }, 404);
  }

  const responseRows =
    await EvaluationRepository.getChecklistResponses(env.DB, id);

  const checklistResponses: Record<string, string> = {};

  for (const row of responseRows) {
    if (
      row.item_id !== undefined &&
      row.item_id !== null &&
      row.resposta !== undefined &&
      row.resposta !== null
    ) {
      checklistResponses[String(row.item_id)] = String(row.resposta);
    }
  }

  let resultado = null;

  try {
    if (evaluationRow.resultado) {
      resultado =
        typeof evaluationRow.resultado === 'string'
          ? JSON.parse(evaluationRow.resultado)
          : evaluationRow.resultado;
    }
  } catch (error) {
    console.error(
      `Erro ao interpretar o resultado da avaliação ${id}:`,
      error
    );
  }

  const notaTeorica =
    evaluationRow.nota_teorica !== null &&
    evaluationRow.nota_teorica !== undefined
      ? Number(evaluationRow.nota_teorica)
      : undefined;

  const mappedEvaluation = {
    id: String(evaluationRow.id),
    nomeTecnico: evaluationRow.nome_tecnico,
    matricula: evaluationRow.matricula,
    empresa: evaluationRow.empresa,
    cidadeBase: evaluationRow.cidade_base,
    nomeCQ: evaluationRow.nome_cq,

    avaliadorId:
      evaluationRow.avaliador_id !== null &&
      evaluationRow.avaliador_id !== undefined
        ? String(evaluationRow.avaliador_id)
        : undefined,

    data: evaluationRow.data,
    tipoCertificacao:
      evaluationRow.certificacao_nome ||
      String(evaluationRow.certificacao_id),

    status: evaluationRow.status,

    checklistResponses,

    resultado,
    observacao: evaluationRow.observacao || '',

    notaTeorica,

    notaPratica:
      evaluationRow.nota_pratica !== null &&
      evaluationRow.nota_pratica !== undefined
        ? Number(evaluationRow.nota_pratica)
        : undefined,

    modoCertificacao:
      evaluationRow.modo_certificacao || 'TRADICIONAL',

    praticaLiberada:
      notaTeorica !== undefined &&
      Number.isFinite(notaTeorica) &&
      notaTeorica >= 7,

    iaStatusConsolidado:
      evaluationRow.ia_status_consolidado || 'NAO_SOLICITADA',

    iaResultadoConsolidadoJson:
      evaluationRow.ia_resultado_consolidado_json || null,

    iaFingerprintConsolidada:
      evaluationRow.ia_fingerprint_consolidada || null,

    iaReanalisePendente:
      evaluationRow.ia_reanalise_pendente || 0,

    createdAt: evaluationRow.created_at,
    updatedAt: evaluationRow.updated_at
  };

  return jsonResponse({
    success: true,
    data: mappedEvaluation,
    evaluation: mappedEvaluation
  });
}

    if (request.method === 'PUT') {
      const data = await request.json() as any;
      const updatedRow = await EvaluationService.createOrUpdate(env.DB, { ...data, id });

      if (!updatedRow) {
        return jsonResponse({
          success: false,
          error: "Não encontrado",
          message: "Avaliação não pôde ser localizada após a atualização."
        }, 404);
      }

      const resps = await EvaluationRepository.getChecklistResponses(env.DB, id);
      const responsesObj: Record<number, string> = {};
      resps.forEach((r: any) => {
        responsesObj[r.item_id] = r.resposta;
      });

      let resObj = null;
      try {
        if (updatedRow.resultado) {
          resObj = JSON.parse(updatedRow.resultado);
        }
      } catch (e) {
        console.error("Error parsing resultado", e);
      }

      const nota = updatedRow.nota_teorica !== null ? Number(updatedRow.nota_teorica) : null;
      const praticaLiberada = nota !== null && Number.isFinite(nota) && nota >= 7;

      const mapped = {
        id: String(updatedRow.id),
        nomeTecnico: updatedRow.nome_tecnico,
        matricula: updatedRow.matricula,
        empresa: updatedRow.empresa,
        cidadeBase: updatedRow.cidade_base,
        nomeCQ: updatedRow.nome_cq,
        avaliadorId: updatedRow.avaliador_id ? String(updatedRow.avaliador_id) : undefined,
        data: updatedRow.data,
        tipoCertificacao: updatedRow.certificacao_nome || String(updatedRow.certificacao_id),
        status: updatedRow.status,
        checklistResponses: responsesObj,
        resultado: resObj,
        observacao: updatedRow.observacao || '',
        notaTeorica: updatedRow.nota_teorica !== null ? Number(updatedRow.nota_teorica) : undefined,
        notaPratica: updatedRow.nota_pratica !== null ? Number(updatedRow.nota_pratica) : undefined,
        modoCertificacao: updatedRow.modo_certificacao || 'TRADICIONAL',
        praticaLiberada,
        iaStatusConsolidado: updatedRow.ia_status_consolidado || 'NAO_SOLICITADA',
        iaResultadoConsolidadoJson: updatedRow.ia_resultado_consolidado_json || null,
        iaFingerprintConsolidada: updatedRow.ia_fingerprint_consolidada || null,
        iaReanalisePendente: updatedRow.ia_reanalise_pendente || 0,
        createdAt: updatedRow.created_at,
        updatedAt: updatedRow.updated_at
      };

      return jsonResponse({ success: true, data: mapped, evaluation: mapped });
    }

    if (request.method === 'DELETE') {
      await EvaluationRepository.delete(env.DB, id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({
      success: false,
      error: "Método não permitido",
      message: `O método ${request.method} não é suportado nesta rota.`
    }, 405);

  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha de processamento na avaliação",
      message: error.message
    }, 500);
  }
};
