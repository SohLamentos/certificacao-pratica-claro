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
