import { initDb, Env, jsonResponse } from '../../_db';

// Helper to calculate expiration date (defaults to 7 days from now)
function getFutureISOString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;
    const { login } = body;

    if (!login) {
      return jsonResponse({ success: false, error: "Por favor, informe seu login/matrícula." }, 400);
    }

    const cleanLogin = String(login).trim().toUpperCase();

    // 1. Fetch active evaluations for this technician login
    // Active statuses: AGENDADA, PORTAL_LIBERADO, EM_ENVIO, EVIDENCIAS_ENVIADAS, AGUARDANDO_ANALISE, PRONTO_PARA_CERTIFICACAO, EM_ANDAMENTO, AGENDADO
    const activeStatuses = [
      'AGENDADA', 'AGENDADO', 'EM_ANDAMENTO', 'PORTAL_LIBERADO', 'EM_ENVIO', 
      'EVIDENCIAS_ENVIADAS', 'AGUARDANDO_ANALISE', 'PRONTO_PARA_CERTIFICACAO'
    ];

    // Select matching evaluations
    const { results: evaluations } = await env.DB.prepare(`
      SELECT a.id, a.nome_tecnico, a.matricula, a.status, a.data, a.empresa, a.cidade_base, a.certificacao_id,
             c.nome as certificacao_nome
      FROM avaliacoes a
      LEFT JOIN certificacoes c ON a.certificacao_id = c.id
      WHERE UPPER(a.matricula) = ?
      ORDER BY a.data DESC, a.created_at DESC
    `).bind(cleanLogin).all();

    if (!evaluations || evaluations.length === 0) {
      return jsonResponse({ 
        success: false, 
        error: "Nenhuma avaliação localizada para este login. Verifique com seu supervisor ou analista." 
      }, 404);
    }

    // Filter evaluations into active ones
    const activeEvals = evaluations.filter((a: any) => {
      const statusUpper = String(a.status).toUpperCase();
      return activeStatuses.includes(statusUpper) && 
             statusUpper !== 'APROVADA' && 
             statusUpper !== 'APROVADO' && 
             statusUpper !== 'REPROVADA' && 
             statusUpper !== 'REPROVADO' && 
             statusUpper !== 'CANCELADA' && 
             statusUpper !== 'CANCELADO' && 
             statusUpper !== 'NO_SHOW';
    });

    if (activeEvals.length === 0) {
      return jsonResponse({
        success: false,
        error: "Todas as suas avaliações anteriores já foram concluídas ou canceladas. Não há avaliações ativas no momento."
      }, 400);
    }

    // For each active evaluation, ensure a portal exists (lazy-create)
    const portalsWithEvals = [];
    const now = new Date().toISOString();

    for (const ev of activeEvals) {
      let portal = await env.DB.prepare(
        "SELECT * FROM portais_evidencias WHERE avaliacao_id = ?"
      ).bind(ev.id).first() as any;

      if (!portal) {
        const token = crypto.randomUUID().replace(/-/g, '');
        const portalId = crypto.randomUUID();
        const expiraEm = getFutureISOString(7); // 7 days

        await env.DB.prepare(`
          INSERT INTO portais_evidencias (id, avaliacao_id, token_hash, status, liberado_em, expira_em, created_at, updated_at)
          VALUES (?, ?, ?, 'LIBERADO', ?, ?, ?, ?)
        `).bind(portalId, ev.id, token, now, expiraEm, now, now).run();

        portal = {
          id: portalId,
          avaliacao_id: ev.id,
          token_hash: token,
          status: 'LIBERADO',
          liberado_em: now,
          expira_em: expiraEm,
          created_at: now,
          updated_at: now
        };
      }

      // Fetch active missions
      const missionsRes = await env.DB.prepare(`
        SELECT id, obrigatoria, permite_reuso_mesma_imagem
        FROM missoes_evidencias 
        WHERE certificacao_id = ? AND ativa = 1
      `).bind(ev.certificacao_id).all();
      const activeMissions = missionsRes.results || [];
      const totalMissoes = activeMissions.length;

      // Fetch uploaded evidences
      const evs = await env.DB.prepare(`
        SELECT id, missao_id, image_hash, status, repetida, arquivo_excluido, enviada_em, created_at 
        FROM evidencias 
        WHERE portal_id = ?
      `).bind(portal.id).all();
      const evsResults = evs.results || [];

      const activeMissionsMap = new Map<string, any>();
      for (const m of activeMissions as any[]) {
        activeMissionsMap.set(m.id, m);
      }

      const candidates = (evsResults as any[]).filter(ev => {
        if (ev.arquivo_excluido === 1) return false;
        if (!activeMissionsMap.has(ev.missao_id)) return false;
        if (!ev.status) return false;
        return true;
      });

      candidates.sort((a, b) => {
        const timeA = new Date(a.enviada_em || a.created_at || 0).getTime();
        const timeB = new Date(b.enviada_em || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      const hashFirstUseMission = new Map<string, string>();
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

      const uploadedCount = validMissions.size;

      portalsWithEvals.push({
        portalId: portal.id,
        token: portal.token_hash,
        status: portal.status,
        expiraEm: portal.expira_em,
        avaliacaoId: ev.id,
        nomeTecnico: ev.nome_tecnico,
        matricula: ev.matricula,
        certificacaoNome: ev.certificacao_nome || "GPON",
        dataAvaliacao: ev.data,
        empresa: ev.empresa,
        cidadeBase: ev.cidade_base,
        fotosEnviadas: uploadedCount,
        totalMissoes: totalMissoes
      });
    }

    // Generate session token hash under LGPD guidelines
    if (!env.LGPD_HASH_SALT) {
      return jsonResponse({ success: false, error: "Chave LGPD_HASH_SALT não configurada" }, 500);
    }
    const salt = env.LGPD_HASH_SALT;
    const input = `${cleanLogin}:${salt}:${now}`;
    const enc = new TextEncoder();
    const hashData = enc.encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const sessionHash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

    return jsonResponse({
      success: true,
      sessionHash,
      portals: portalsWithEvals
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
