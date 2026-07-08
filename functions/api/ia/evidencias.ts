import { Env, jsonResponse } from '../_db';
import { EvidenceRepository } from '../_repositories';
import { EvidenceService } from '../_services';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const certIdParam = url.searchParams.get("certificacao_id");

    if (!certIdParam) {
      return jsonResponse({
        success: false,
        error: "Parâmetros obrigatórios ausentes",
        message: "O parâmetro certificacao_id é obrigatório."
      }, 400);
    }

    const evidencias = await EvidenceRepository.getByCertId(env.DB, certIdParam);
    const auditoria = await EvidenceRepository.getAuditByCertId(env.DB, certIdParam);

    return jsonResponse({
      success: true,
      evidencias,
      auditoria
    });
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao recuperar evidências",
      message: error.message
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const data = await request.json() as any;

    const {
      id,
      certificacao_id,
      etapa,
      decisao_cq,
      observacao_cq,
      is_cq_decision,
      usuario_id,
      perfil_usuario
    } = data;

    if (!certificacao_id) {
      return jsonResponse({ success: false, error: "Parâmetro certificacao_id é obrigatório." }, 400);
    }

    if (is_cq_decision) {
      if (!id) {
        return jsonResponse({ success: false, error: "Identificador da evidência (id) é obrigatório para decisão." }, 400);
      }

      const finalUserId = usuario_id || "cq_user";
      const finalPerfil = perfil_usuario || "cq";

      // Generate login_hash securely using environment variable
      const salt = env.LGPD_HASH_SALT || "claro_cq_lgpd_salt_2026_prod";
      const input = `${finalUserId}:${salt}`;
      const enc = new TextEncoder();
      const hashData = enc.encode(input);
      const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

      await EvidenceService.handleCQDecision(
        env.DB,
        id,
        certificacao_id,
        decisao_cq,
        observacao_cq,
        etapa,
        { userId: finalUserId, perfil: finalPerfil, loginHash: login_hash }
      );

      return jsonResponse({ success: true, evidenceId: id });
    }

    return jsonResponse({ success: false, error: "Ação de post inválida ou não suportada." }, 400);
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao processar decisão de CQ",
      message: error.message
    }, 500);
  }
};
