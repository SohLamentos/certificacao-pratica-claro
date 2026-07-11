import { initDb, Env, jsonResponse } from '../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);

    // Economy & Admin Indicators
    const todayStr = new Date().toISOString().split('T')[0];
    const logsTodayRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM ia_analises_logs WHERE ia_requested_at LIKE ?"
    ).bind(`${todayStr}%`).first() as any;
    const analisesHoje = logsTodayRow ? logsTodayRow.cnt : 0;

    const totalLogsRow = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN reaproveitada = 1 OR ia_status = 'REAPROVEITADA' OR ia_status = 'CACHE' THEN 1 ELSE 0 END) as hits, 
        SUM(economia_estimada) as total_savings 
      FROM ia_analises_logs
    `).first() as any;

    const totalLogs = totalLogsRow ? totalLogsRow.total : 0;
    const cacheHits = totalLogsRow && totalLogsRow.hits ? totalLogsRow.hits : 0;
    const chamadasEvitadas = cacheHits;
    const taxaCacheHit = totalLogs > 0 ? Math.round((cacheHits / totalLogs) * 100) : 0;
    const economiaEstimadaUSD = totalLogsRow && totalLogsRow.total_savings ? totalLogsRow.total_savings : 0.0;

    // 1. General Metrics
    const totalRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history").first() as any;
    const total = totalRow ? totalRow.cnt : 0;

    const confRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE cq_confirmou = 1").first() as any;
    const confirmations = confRow ? confRow.cnt : 0;

    const corrRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE cq_corrigiu = 1").first() as any;
    const corrections = corrRow ? corrRow.cnt : 0;

    const accuracy = total > 0 ? Math.round((confirmations / total) * 100) : 100;

    // 2. Confidence Statistics
    const avgConfRow = await env.DB.prepare("SELECT AVG(confidence) as avg_conf FROM ia_decision_history").first() as any;
    const avgConfidence = avgConfRow && avgConfRow.avg_conf ? Math.round(avgConfRow.avg_conf) : 92;

    const highConfRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE confidence >= 90").first() as any;
    const highConfCount = highConfRow ? highConfRow.cnt : 0;

    const medConfRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE confidence >= 70 AND confidence < 90").first() as any;
    const medConfCount = medConfRow ? medConfRow.cnt : 0;

    const lowConfRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE confidence >= 50 AND confidence < 70").first() as any;
    const lowConfCount = lowConfRow ? lowConfRow.cnt : 0;

    const revConfRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ia_decision_history WHERE confidence < 50").first() as any;
    const revConfCount = revConfRow ? revConfRow.cnt : 0;

    // 3. Financial & ROI Metrics
    // Traditional human audit estimated cost: R$ 15,00 per evidence audit
    const costPerHumanAudit = 15.00;
    const estimatedHumanCost = total * costPerHumanAudit;

    // Actual IA Cost (Workers AI is free on free tier, paid triggers estimated in DB)
    const actualIaCostRow = await env.DB.prepare("SELECT SUM(ia_custo_estimado) as total_cost FROM ia_evidencias").first() as any;
    const actualIaCostUSD = actualIaCostRow && actualIaCostRow.total_cost ? actualIaCostRow.total_cost : 0.0;
    // Let's convert USD to BRL roughly (e.g. 1 USD = 5.00 BRL) for comparison consistency
    const actualIaCostBRL = actualIaCostUSD * 5.00;

    const netSavings = estimatedHumanCost - actualIaCostBRL;
    const roi = actualIaCostBRL > 0 ? Math.round((netSavings / actualIaCostBRL) * 100) : (netSavings > 0 ? 1000 : 100);

    // 4. Divergences by Checklist/Stage
    const divergencesRes = await env.DB.prepare(`
      SELECT checklist as etapa, COUNT(*) as corrections 
      FROM ia_decision_history 
      WHERE cq_corrigiu = 1 
      GROUP BY checklist 
      ORDER BY corrections DESC
    `).all();
    const divergencesByStage = divergencesRes.results || [];

    // 5. Automatedsuggestions for rules revision
    const suggestionsRes = await env.DB.prepare(`
      SELECT * FROM ia_sugestoes_admin
      ORDER BY created_at DESC
    `).all();
    const suggestions = suggestionsRes.results || [];

    // 6. Recent History for Audit Log
    const recentHistoryRes = await env.DB.prepare(`
      SELECT id, modelo, confidence, resultado, tempo_processamento, certificacao, checklist, cq_confirmou, cq_corrigiu, created_at
      FROM ia_decision_history
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    const recentHistory = recentHistoryRes.results || [];

    return jsonResponse({
      success: true,
      metrics: {
        total,
        confirmations,
        corrections,
        accuracy,
        avgConfidence,
        analises_hoje: analisesHoje,
        taxa_cache_hit: taxaCacheHit,
        chamadas_evitadas: chamadasEvitadas,
        economia_acumulada_usd: economiaEstimadaUSD
      },
      confidenceStats: {
        high: highConfCount,
        medium: medConfCount,
        low: lowConfCount,
        review: revConfCount
      },
      financials: {
        estimatedHumanCost,
        actualIaCostBRL,
        actualIaCostUSD,
        netSavings,
        roi
      },
      divergencesByStage,
      suggestions,
      recentHistory
    });

  } catch (err: any) {
    console.error("GET ia/dashboard error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao buscar métricas de IA." }, 500);
  }
};

// POST: Toggle suggestion status (e.g. mark as read/resolved)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const { id, status } = await request.json() as { id: string; status: string };

    if (!id || !status) {
      return jsonResponse({ success: false, error: "ID e Status são obrigatórios." }, 400);
    }

    await env.DB.prepare("UPDATE ia_sugestoes_admin SET status = ? WHERE id = ?").bind(status, id).run();

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("POST ia/dashboard suggestion update error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao atualizar sugestão." }, 500);
  }
};
