import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);

    const url = new URL(request.url);
    const dataInicio = url.searchParams.get('dataInicio');
    const dataFim = url.searchParams.get('dataFim');

    let whereClause = '';
    const queryParams: any[] = [];

    if (dataInicio && dataFim) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dataInicio) || !dateRegex.test(dataFim)) {
        return jsonResponse({ success: false, error: "Formato de data inválido. Use AAAA-MM-DD." }, 400);
      }
      if (dataInicio > dataFim) {
        return jsonResponse({ success: false, error: "A data inicial não pode ser maior que a data final." }, 400);
      }
      whereClause = 'WHERE a.data >= ? AND a.data <= ?';
      queryParams.push(dataInicio, dataFim);
    }

    // Fetch all evaluations, portals, and certifications
    let query = `
      SELECT 
        a.id as avaliacao_id,
        a.nome_tecnico,
        a.matricula,
        a.status as avaliacao_status,
        a.data as data_avaliacao,
        a.created_at as avaliacao_created_at,
        c.id as certificacao_id,
        c.nome as certificacao_nome,
        p.id as portal_id,
        p.status as portal_status,
        p.expira_em,
        p.updated_at as portal_updated_at
      FROM avaliacoes a
      LEFT JOIN certificacoes c ON a.certificacao_id = c.id
      LEFT JOIN portais_evidencias p ON a.id = p.avaliacao_id
    `;

    if (whereClause) {
      query += ` ${whereClause}`;
    }

    query += ' ORDER BY a.data DESC, a.created_at DESC';

    const stmt = env.DB.prepare(query);
    const { results: rows } = queryParams.length > 0 ? await stmt.bind(...queryParams).all() : await stmt.all();

    const trackerItems = [];

    // Fetch counts for each row
    for (const r of rows as any[]) {
      const evaluationId = r.avaliacao_id;
      const portalId = r.portal_id;
      const certificacaoId = r.certificacao_id;

      // 1. Fetch total and mandatory missions for this certification
      const missionsRow = await env.DB.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN obrigatoria = 1 THEN 1 ELSE 0 END) as mandatory
        FROM missoes_evidencias 
        WHERE certificacao_id = ? AND ativa = 1
      `).bind(certificacaoId).first() as any;

      const totalMissions = missionsRow ? (missionsRow.total || 0) : 0;
      const mandatoryMissions = missionsRow ? (missionsRow.mandatory || 0) : 0;

      // 2. Fetch evidences details
      let totalUploaded = 0;
      let repeatedCount = 0;
      let lastActivity: string | null = null;
      let hasRejected = false;
      let hasPending = false;
      let hasApproved = false;

      if (portalId) {
        const evs = await env.DB.prepare(`
          SELECT status, repetida, enviada_em 
          FROM evidencias 
          WHERE portal_id = ?
        `).bind(portalId).all();

        const evsResults = evs.results || [];
        totalUploaded = evsResults.length;

        for (const ev of evsResults as any[]) {
          if (ev.repetida === 1) {
            repeatedCount++;
          }
          if (ev.status === 'REJEITADO' || ev.status === 'REPROVADO') {
            hasRejected = true;
          } else if (ev.status === 'PENDENTE' || ev.status === 'ANALISANDO' || !ev.status) {
            hasPending = true;
          } else if (ev.status === 'APROVADO' || ev.status === 'APROVADA') {
            hasApproved = true;
          }

          if (ev.enviada_em) {
            if (!lastActivity || ev.enviada_em > lastActivity) {
              lastActivity = ev.enviada_em;
            }
          }
        }
      }

      // Fallback for lastActivity
      if (!lastActivity && r.portal_updated_at) {
        lastActivity = r.portal_updated_at;
      } else if (!lastActivity) {
        lastActivity = r.avaliacao_created_at;
      }

      // Compute general IA status for tracker item
      let iaStatus = 'PENDENTE';
      if (totalUploaded === 0) {
        iaStatus = 'SEM_FOTOS';
      } else if (hasRejected) {
        iaStatus = 'REVISAO_NECESSARIA';
      } else if (hasPending) {
        iaStatus = 'AGUARDANDO_IA';
      } else if (hasApproved) {
        iaStatus = 'COMPLETO_APROVADO';
      }

      // Calculate days left
      let diasRestantes = 0;
      if (r.expira_em) {
        const expDate = new Date(r.expira_em);
        diasRestantes = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      }

      // Check urgent 48h limit
      let urgente48h = false;
      if (r.data_avaliacao) {
        const avalDate = new Date(r.data_avaliacao);
        const timeDiff = avalDate.getTime() - Date.now();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        // Urgent if certification/evaluation date is within next 48 hours or is past, and not yet certified/closed
        const isClosed = ['APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW'].includes(String(r.avaliacao_status).toUpperCase());
        if (hoursDiff <= 48 && !isClosed) {
          urgente48h = true;
        }
      }

      // Check stale activity (no updates for >24h with photos uploaded)
      let stale24h = false;
      if (totalUploaded > 0 && lastActivity) {
        const lastActTime = new Date(lastActivity).getTime();
        const hoursSinceLastAct = (Date.now() - lastActTime) / (1000 * 60 * 60);
        if (hoursSinceLastAct > 24) {
          stale24h = true;
        }
      }

      // Final item shape
      trackerItems.push({
        avaliacaoId: evaluationId,
        portalId: portalId || null,
        tecnico: r.nome_tecnico || 'Técnico Não Identificado',
        login: r.matricula || '-',
        certificacao: r.certificacao_nome || 'GPON',
        dataAvaliacao: r.data_avaliacao,
        statusAvaliacao: r.avaliacao_status,
        portalStatus: r.portal_status || 'NAO_CRIADO',
        prazo: r.expira_em || null,
        diasRestantes,
        quantidadeMissoes: totalMissions,
        fotosEsperadas: mandatoryMissions,
        fotosEnviadas: totalUploaded,
        ultimaAtividade: lastActivity,
        statusIa: iaStatus,
        alertas: {
          zeroFotos: totalUploaded === 0,
          urgente48h,
          stale24h,
          imagemRepetida: repeatedCount > 0
        },
        repeatedCount
      });
    }

    return jsonResponse({
      success: true,
      tracker: trackerItems
    });

  } catch (error: any) {
    console.error("GET /api/evidencias/portais-tracker error:", error);
    return jsonResponse({ success: false, error: error.message || "Erro ao buscar dados de acompanhamento." }, 500);
  }
};
