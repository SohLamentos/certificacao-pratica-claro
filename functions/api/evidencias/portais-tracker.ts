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

    // Optimize N+1: Fetch all active missions and group in memory
    const missionsRes = await env.DB.prepare(`
      SELECT 
        id,
        certificacao_id,
        obrigatoria,
        permite_reuso_mesma_imagem
      FROM missoes_evidencias 
      WHERE ativa = 1
    `).all();
    const allMissions = missionsRes.results || [];
    const missionsByCertMap = new Map<number, any[]>();
    for (const m of allMissions as any[]) {
      const cId = Number(m.certificacao_id);
      if (!missionsByCertMap.has(cId)) {
        missionsByCertMap.set(cId, []);
      }
      missionsByCertMap.get(cId)!.push(m);
    }

    // Optimize N+1: Fetch all evidences for all active portal IDs in a single batch
    const portalIds = [...new Set((rows as any[]).map(r => r.portal_id).filter(Boolean))];
    const evidencesByPortalMap = new Map<string, any[]>();
    if (portalIds.length > 0) {
      const placeholders = portalIds.map(() => '?').join(',');
      const evsRes = await env.DB.prepare(`
        SELECT id, portal_id, missao_id, image_hash, status, repetida, arquivo_excluido, enviada_em, created_at 
        FROM evidencias 
        WHERE portal_id IN (${placeholders})
      `).bind(...portalIds).all();
      const evsList = evsRes.results || [];
      for (const ev of evsList as any[]) {
        const pId = ev.portal_id;
        if (!evidencesByPortalMap.has(pId)) {
          evidencesByPortalMap.set(pId, []);
        }
        evidencesByPortalMap.get(pId)!.push(ev);
      }
    }

    // Fetch counts for each row using the grouped in-memory data
    for (const r of rows as any[]) {
      const evaluationId = r.avaliacao_id;
      const portalId = r.portal_id;
      const certificacaoId = r.certificacao_id;

      // 1. Get total and mandatory missions for this certification from in-memory map
      const activeMissions = missionsByCertMap.get(Number(certificacaoId)) || [];
      const totalMissions = activeMissions.length;
      const mandatoryMissions = activeMissions.filter((m: any) => m.obrigatoria === 1).length;

      // 2. Fetch evidences details
      let totalUploaded = 0;
      let repeatedCount = 0;
      let lastActivity: string | null = null;
      let hasRejected = false;
      let hasPending = false;
      let hasApproved = false;

      const evsResults = portalId ? (evidencesByPortalMap.get(portalId) || []) : [];

      if (portalId) {
        // Build active missions lookup map
        const activeMissionsMap = new Map<string, any>();
        for (const m of activeMissions as any[]) {
          activeMissionsMap.set(m.id, m);
        }

        // Filter valid candidates for progress
        const candidates = (evsResults as any[]).filter(ev => {
          if (ev.arquivo_excluido === 1) return false;
          if (!activeMissionsMap.has(ev.missao_id)) return false;
          if (!ev.status) return false;
          return true;
        });

        // Sort candidates by creation/upload time
        candidates.sort((a, b) => {
          const timeA = new Date(a.enviada_em || a.created_at || 0).getTime();
          const timeB = new Date(b.enviada_em || b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });

        // Determine valid missions completed
        const hashFirstUseMission = new Map<string, string>(); // image_hash -> first mission_id
        const validMissions = new Set<string>();

        for (const ev of candidates) {
          const hash = ev.image_hash;
          const missionId = ev.missao_id;
          const m = activeMissionsMap.get(missionId)!;

          if (!hashFirstUseMission.has(hash)) {
            hashFirstUseMission.set(hash, missionId);
            validMissions.add(missionId);
          } else {
            const firstMissionId = hashFirstUseMission.get(hash)!;
            if (firstMissionId === missionId) {
              continue;
            }
            const firstMission = activeMissionsMap.get(firstMissionId);
            const currentMission = m;

            const firstAllows = firstMission?.permite_reuso_mesma_imagem === 1;
            const currentAllows = currentMission?.permite_reuso_mesma_imagem === 1;

            if (firstAllows && currentAllows) {
              validMissions.add(missionId);
            }
          }
        }

        // Count how many of the validMissions are mandatory
        const validMandatoryMissions = [...validMissions].filter(mid => {
          const m = activeMissionsMap.get(mid);
          return m && m.obrigatoria === 1;
        });

        totalUploaded = validMandatoryMissions.length;

        for (const ev of evsResults as any[]) {
          if (ev.arquivo_excluido === 1) continue;

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
