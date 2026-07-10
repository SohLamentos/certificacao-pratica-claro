import { initDb, Env, jsonResponse } from '../_db';

// Helper to calculate expiration date (defaults to 7 days from now)
function getFutureISOString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const avaliacaoId = url.searchParams.get("avaliacaoId");

    if (!avaliacaoId) {
      return jsonResponse({ success: false, error: "avaliacaoId é obrigatório" }, 400);
    }

    // 1. Fetch evaluation details
    const avaliacao = await env.DB.prepare(
      "SELECT id, status, nome_tecnico, matricula, certificacao_id FROM avaliacoes WHERE id = ?"
    ).bind(avaliacaoId).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação não encontrada" }, 404);
    }

    // 2. Fetch portal details
    let portal = await env.DB.prepare(
      "SELECT * FROM portais_evidencias WHERE avaliacao_id = ?"
    ).bind(avaliacaoId).first() as any;

    const requestOrigin = url.origin;

    // 3. Lazy initialize portal if not present
    if (!portal) {
      const token = crypto.randomUUID().replace(/-/g, ''); // Generate unique non-sequential token
      const portalId = crypto.randomUUID();
      const now = new Date().toISOString();
      const expiraEm = getFutureISOString(7); // 7 days validity by default

      // Determine initial status based on evaluation status
      let initialStatus = "LIBERADO";
      let encerradoEm = null;
      let encerradoMotivo = null;

      if (avaliacao.status === "APROVADA" || avaliacao.status === "APROVADO") {
        initialStatus = "ENCERRADO_APROVADO";
        encerradoEm = now;
        encerradoMotivo = "Avaliação já concluída e aprovada";
      } else if (avaliacao.status === "REPROVADA" || avaliacao.status === "REPROVADO") {
        initialStatus = "ENCERRADO_REPROVADO";
        encerradoEm = now;
        encerradoMotivo = "Avaliação já concluída e reprovada";
      } else if (avaliacao.status === "CANCELADA" || avaliacao.status === "CANCELADO") {
        initialStatus = "ENCERRADO_CANCELADO";
        encerradoEm = now;
        encerradoMotivo = "Avaliação cancelada";
      }

      await env.DB.prepare(`
        INSERT INTO portais_evidencias (id, avaliacao_id, token_hash, status, liberado_em, expira_em, encerrado_em, encerrado_motivo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        portalId,
        avaliacaoId,
        token,
        initialStatus,
        now,
        expiraEm,
        encerradoEm,
        encerradoMotivo,
        now,
        now
      ).run();

      portal = {
        id: portalId,
        avaliacao_id: avaliacaoId,
        token_hash: token,
        status: initialStatus,
        liberado_em: now,
        expira_em: expiraEm,
        encerrado_em: encerradoEm,
        encerrado_motivo: encerradoMotivo,
        created_at: now,
        updated_at: now
      };
    }

    const portalUrl = `${requestOrigin}/evidencias/${portal.token_hash}`;

    return jsonResponse({
      success: true,
      portal: {
        id: portal.id,
        avaliacaoId: portal.avaliacao_id,
        token: portal.token_hash,
        status: portal.status,
        liberadoEm: portal.liberado_em,
        expiraEm: portal.expira_em,
        encerradoEm: portal.encerrado_em,
        encerradoMotivo: portal.encerrado_motivo,
        reabertoEm: portal.reaberto_em,
        reabertoPor: portal.reaberto_por,
        ultimoAcessoEm: portal.ultimo_acesso_em,
        portalUrl
      },
      evaluation: {
        id: avaliacao.id,
        status: avaliacao.status,
        nomeTecnico: avaliacao.nome_tecnico,
        matricula: avaliacao.matricula,
        certificacaoId: avaliacao.certificacao_id
      }
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    const { avaliacaoId, action, expiraEmDays, motivo, reabertoPor } = data;

    if (!avaliacaoId) {
      return jsonResponse({ success: false, error: "avaliacaoId é obrigatório" }, 400);
    }

    const portal = await env.DB.prepare(
      "SELECT * FROM portais_evidencias WHERE avaliacao_id = ?"
    ).bind(avaliacaoId).first() as any;

    if (!portal) {
      return jsonResponse({ success: false, error: "Portal não encontrado para esta avaliação. Use GET para criá-lo primeiro." }, 404);
    }

    const now = new Date().toISOString();

    if (action === "reopen") {
      // Reopen portal
      const expiraEm = getFutureISOString(expiraEmDays || 3);
      await env.DB.prepare(`
        UPDATE portais_evidencias
        SET status = 'LIBERADO',
            expira_em = ?,
            encerrado_em = NULL,
            encerrado_motivo = NULL,
            reaberto_em = ?,
            reaberto_por = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(expiraEm, now, reabertoPor || "Analista", now, portal.id).run();

      return jsonResponse({ success: true, message: "Portal reaberto com sucesso." });
    }

    if (action === "close") {
      // Manually close portal
      await env.DB.prepare(`
        UPDATE portais_evidencias
        SET status = 'EXPIRADO',
            encerrado_em = ?,
            encerrado_motivo = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(now, motivo || "Fechamento manual pelo analista", now, portal.id).run();

      return jsonResponse({ success: true, message: "Portal encerrado com sucesso." });
    }

    return jsonResponse({ success: false, error: "Ação inválida" }, 400);

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
