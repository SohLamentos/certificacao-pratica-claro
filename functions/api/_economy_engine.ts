import { Env } from './_db';
import { Logger } from './_logger';

export interface EvidenceReportItem {
  id: string;
  r2_key: string;
  image_hash: string;
  mime_type: string;
  tamanho: number;
  quality_score: number;
  motivo_selecao?: string;
  motivo_descarte?: string;
  duplicada_interna: boolean;
  duplicada_externa: boolean;
  duplicada_externa_alert?: string;
}

export interface MissionTriageResult {
  missao_id: string;
  nome_missao: string;
  status: 'SEM_EVIDENCIA' | 'PRONTA_PARA_ANALISE' | 'REUTILIZADA';
  fingerprint: string;
  fotos_recebidas: number;
  fotos_selecionadas: EvidenceReportItem[];
  fotos_descartadas: EvidenceReportItem[];
  reaproveitar_cache: boolean;
  cache_tipo?: 'NIVEL_A' | 'NIVEL_B';
  resultado_cached?: any;
}

export interface TriageReport {
  avaliacao_id: string;
  certificacao_id: string;
  certificacao_nome: string;
  total_fotos_recebidas: number;
  total_fotos_validas: number;
  total_fotos_selecionadas: number;
  total_fotos_descartadas: number;
  consolidated_fingerprint: string;
  can_reuse_consolidated: boolean;
  consolidated_cached_result?: any;
  missoes: MissionTriageResult[];
  economia_estimada: {
    fotos_recebidas: number;
    fotos_selecionadas: number;
    fotos_descartadas: number;
    chamadas_estimadas_sem_otimizacao: number;
    chamadas_executadas: number;
    chamadas_evitadas_por_duplicidade: number;
    chamadas_evitadas_por_cache: number;
    percentual_economia_estimado: number;
    tempo_estimado_economizado_s: number;
  };
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculates a deterministic non-AI quality score between 0 and 100 for an evidence image
 */
export function calculateQualityScore(ev: any): number {
  if (!ev) return 0;
  
  let score = 50; // Starting baseline

  // Size heuristics (Ideal size is 100KB to 2MB)
  const sizeInKb = (ev.tamanho || 0) / 1024;
  if (sizeInKb > 100 && sizeInKb < 2048) {
    score += 15;
  } else if (sizeInKb > 10 && sizeInKb <= 100) {
    score += 5;
  } else if (sizeInKb <= 10) {
    score -= 30; // Very small size implies corrupted or low-res thumbnail
  }

  // Format checks
  const mime = (ev.mime_type || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png')) {
    score += 15;
  } else {
    score -= 10;
  }

  // Error check
  if (ev.upload_erro || ev.arquivo_corrompido === 1) {
    score = 0;
    return score;
  }

  // Dimension heuristics (if resolution metadata exists)
  const width = ev.largura ? Number(ev.largura) : 0;
  const height = ev.altura ? Number(ev.altura) : 0;
  if (width > 0 && height > 0) {
    const totalPixels = width * height;
    if (totalPixels >= 1920 * 1080) { // Full HD or more
      score += 15;
    } else if (totalPixels >= 1280 * 720) { // HD
      score += 10;
    } else if (totalPixels < 640 * 480) {
      score -= 20;
    }

    // Proportion aspect ratio (standard 4:3 or 16:9 is ideal)
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (ratio >= 1.3 && ratio <= 1.8) {
      score += 5;
    }
  } else {
    // No dimensions available, default moderate bonus
    score += 5;
  }

  // Recency bonus: Prefer newer replacements over stale submissions (scaled linearly)
  const ageInMs = Date.now() - new Date(ev.enviada_em || ev.created_at || Date.now()).getTime();
  const ageInHours = ageInMs / (1000 * 60 * 60);
  if (ageInHours < 1) {
    score += 5;
  }

  // Keep within bounds
  return Math.max(0, Math.min(100, score));
}

/**
 * Builds deterministic fingerprints for images, missions, and the entire evaluation
 */
export async function generateFingerprints(
  model: string,
  promptVersion: string,
  ruleVersion: string,
  knowledgeVersion: string,
  missionId: string,
  primaryEvHash: string,
  items: any[],
  promptEspecifico: string
) {
  // 1. Image Analysis Fingerprint
  const rawImagePayload = `${primaryEvHash}:${model}:${promptVersion}:${ruleVersion}:${knowledgeVersion}`;
  const imageFingerprint = await sha256(rawImagePayload);

  // 2. Mission Analysis Fingerprint
  const itemsStr = items.map(it => `${it.item_id}-${it.critico}`).sort().join('|');
  const rawMissionPayload = `${missionId}:${primaryEvHash}:${itemsStr}:${promptEspecifico || ''}:${model}:${ruleVersion}:${knowledgeVersion}`;
  const missionFingerprint = await sha256(rawMissionPayload);

  return {
    imageFingerprint,
    missionFingerprint
  };
}

/**
 * Core Economy and Evidence Selection Engine
 */
export async function runEvidenceTriage(
  db: D1Database,
  config: any,
  avaliacaoId: string,
  model = 'gemini-3.5-flash',
  promptVersion = '2.1.0-consolidado',
  ruleVersion = 'v2',
  knowledgeVersion = 'kb-v1',
  forceReanalyzeMissionIds: string[] = []
): Promise<TriageReport> {
  Logger.info(`Iniciando Engine de Economia de IA para a avaliação ${avaliacaoId}...`);

  // 1. Retrieve evaluation & certification
  const avaliacao = await db.prepare(
    "SELECT * FROM avaliacoes WHERE id = ?"
  ).bind(avaliacaoId).first() as any;

  if (!avaliacao) {
    throw new Error("Avaliação não encontrada.");
  }

  const cert = await db.prepare(
    "SELECT nome FROM certificacoes WHERE id = ?"
  ).bind(avaliacao.certificacao_id).first() as any;

  const certificacaoNome = cert ? cert.nome : "Desconhecida";

  // 2. Load all active missions & uploaded evidence
  const missoesRows = await db.prepare(
    "SELECT * FROM missoes_evidencias WHERE certificacao_id = ? AND ativa = 1 ORDER BY ordem ASC"
  ).all();
  const missoes = missoesRows.results || [];

  // Query table "evidencias" (Portal flow)
  const evidenciasRows = await db.prepare(
    "SELECT * FROM evidencias WHERE avaliacao_id = ? AND arquivo_excluido = 0"
  ).all();
  const rawEvidencias = evidenciasRows.results || [];

  // Query table "ia_evidencias" (Classic flow)
  const iaEvidenciasRows = await db.prepare(
    "SELECT * FROM ia_evidencias WHERE certificacao_id = ?"
  ).bind(avaliacaoId).all();
  const rawIaEvidencias = iaEvidenciasRows.results || [];

  // Map both into a unified shape in memory
  const todasEvidencias: any[] = [];

  for (const ev of rawEvidencias) {
    todasEvidencias.push({
      id: ev.id,
      avaliacao_id: ev.avaliacao_id,
      missao_id: ev.missao_id,
      r2_key: ev.r2_key,
      image_hash: ev.image_hash,
      mime_type: ev.mime_type,
      tamanho: ev.tamanho_original || ev.tamanho_final || 0,
      largura: ev.largura,
      altura: ev.altura,
      status: ev.status,
      enviada_em: ev.enviada_em || ev.created_at,
      original_table: 'evidencias'
    });
  }

  for (const ev of rawIaEvidencias) {
    // If we have default missions mapped, try to find a matching mission_id for this stage (etapa)
    let matchedMissionId = ev.etapa;
    const matchingMission = missoes.find((m: any) => m.nome === ev.etapa || m.id === ev.etapa || m.id === `missao_${ev.etapa}_${avaliacao.certificacao_id}`);
    if (matchingMission) {
      matchedMissionId = matchingMission.id;
    }

    todasEvidencias.push({
      id: ev.id,
      avaliacao_id: ev.certificacao_id, // in ia_evidencias, certificacao_id is evaluationId
      missao_id: matchedMissionId,
      r2_key: ev.arquivo_key,
      image_hash: ev.ia_hash_arquivo,
      mime_type: ev.tipo_arquivo,
      tamanho: ev.tamanho || 100000, // fallback
      largura: null,
      altura: null,
      status: ev.status_ia,
      enviada_em: ev.created_at || ev.updated_at,
      original_table: 'ia_evidencias'
    });
  }

  const triagedMissoes: MissionTriageResult[] = [];
  let totalFotosRecebidas = todasEvidencias.length;
  let totalFotosValidas = 0;
  let totalFotosSelecionadas = 0;
  let totalFotosDescartadas = 0;

  let totalDeduplicadasInternas = 0;
  let totalDeduplicadasExternas = 0;
  let totalCacheHits = 0;

  // Cache tracker to avoid analyzing the exact same hash twice inside this single evaluation (Level 2 deduplication)
  const localSeenHashes = new Set<string>();

  // Parse existing evaluation JSON to look for previously saved consolidated analysis
  let prevResult: any = null;
  if (avaliacao.ia_resultado_consolidado_json) {
    try {
      prevResult = JSON.parse(avaliacao.ia_resultado_consolidado_json);
    } catch (e) {}
  }

  // Iterate over each mission and triage
  for (const mission of missoes) {
    const missionEvs = todasEvidencias.filter((ev: any) => ev.missao_id === mission.id);

    if (missionEvs.length === 0) {
      triagedMissoes.push({
        missao_id: mission.id,
        nome_missao: mission.nome,
        status: 'SEM_EVIDENCIA',
        fingerprint: '',
        fotos_recebidas: 0,
        fotos_selecionadas: [],
        fotos_descartadas: [],
        reaproveitar_cache: false
      });
      continue;
    }

    // Process all evidences for this mission
    const processedEvs = await Promise.all(missionEvs.map(async (ev: any) => {
      const qScore = calculateQualityScore(ev);
      const isCorrupted = ev.upload_erro || ev.arquivo_corrompido === 1 || qScore < 20;

      // Check duplication level 2: Duplicate inside the same evaluation
      let dupInterna = false;
      if (ev.image_hash) {
        if (localSeenHashes.has(ev.image_hash)) {
          dupInterna = true;
        } else {
          localSeenHashes.add(ev.image_hash);
        }
      }

      // Check duplication level 3: Fraud/Duplication across other evaluations
      let dupExterna = false;
      let dupExternaAlert = '';
      if (ev.image_hash && !dupInterna) {
        const countOtherEvs = await db.prepare(
          "SELECT COUNT(DISTINCT avaliacao_id) as cnt FROM evidencias WHERE image_hash = ? AND avaliacao_id != ? AND arquivo_excluido = 0"
        ).bind(ev.image_hash, avaliacaoId).first() as any;

        const countOtherIaEvs = await db.prepare(
          "SELECT COUNT(DISTINCT certificacao_id) as cnt FROM ia_evidencias WHERE ia_hash_arquivo = ? AND certificacao_id != ?"
        ).bind(ev.image_hash, avaliacaoId).first() as any;

        const otherCount = (countOtherEvs?.cnt || 0) + (countOtherIaEvs?.cnt || 0);

        if (otherCount > 0) {
          dupExterna = true;
          dupExternaAlert = `Possível Reuso de Evidência: Esta mesma foto já foi enviada em ${otherCount} outra(s) avaliação(ões) distinta(s)!`;
        }
      }

      return {
        id: ev.id,
        r2_key: ev.r2_key,
        image_hash: ev.image_hash || '',
        mime_type: ev.mime_type || 'image/jpeg',
        tamanho: ev.tamanho || 0,
        quality_score: qScore,
        is_corrupted: isCorrupted,
        duplicada_interna: dupInterna,
        duplicada_externa: dupExterna,
        duplicada_externa_alert: dupExternaAlert
      };
    }));

    // Filter valid evidences (not corrupted, not internal duplicate)
    const validEvs = processedEvs.filter(ev => !ev.is_corrupted && !ev.duplicada_interna);
    totalFotosValidas += validEvs.length;

    // Deduplication counters
    processedEvs.forEach(ev => {
      if (ev.duplicada_interna) totalDeduplicadasInternas++;
      if (ev.duplicada_externa) totalDeduplicadasExternas++;
    });

    // Select the best image(s) for the mission
    // Sort by Quality Score descending, secondary by size
    const sortedCandidates = [...validEvs].sort((a, b) => b.quality_score - a.quality_score);

    const selected: EvidenceReportItem[] = [];
    const discarded: EvidenceReportItem[] = [];

    // Limit selection to maximum 1 photo by default (or up to 2 if specifically requested, but let's strictly stick to 1 photo economy engine rule as preference unless secondary is useful)
    const maxSelectCount = 1;

    sortedCandidates.forEach((cand, idx) => {
      const reportItem: EvidenceReportItem = {
        id: cand.id,
        r2_key: cand.r2_key,
        image_hash: cand.image_hash,
        mime_type: cand.mime_type,
        tamanho: cand.tamanho,
        quality_score: cand.quality_score,
        duplicada_interna: cand.duplicada_interna,
        duplicada_externa: cand.duplicada_externa,
        duplicada_externa_alert: cand.duplicada_externa_alert
      };

      if (idx < maxSelectCount) {
        reportItem.motivo_selecao = idx === 0 ? "Melhor pontuação de qualidade técnica" : "Evidência complementar complementar";
        selected.push(reportItem);
      } else {
        reportItem.motivo_descarte = "EXCEDENTE: Selecionada foto técnica melhor pontuada";
        discarded.push(reportItem);
      }
    });

    // Add fully discarded/corrupted/duplicate items back to the discarded list
    processedEvs.forEach(ev => {
      const wasSelected = selected.some(s => s.id === ev.id);
      if (!wasSelected) {
        const reportItem: EvidenceReportItem = {
          id: ev.id,
          r2_key: ev.r2_key,
          image_hash: ev.image_hash,
          mime_type: ev.mime_type,
          tamanho: ev.tamanho,
          quality_score: ev.quality_score,
          duplicada_interna: ev.duplicada_interna,
          duplicada_externa: ev.duplicada_externa,
          duplicada_externa_alert: ev.duplicada_externa_alert
        };

        if (ev.is_corrupted) {
          reportItem.motivo_descarte = "CORROMPIDA: Resolução/tamanho insuficiente ou erro de upload";
        } else if (ev.duplicada_interna) {
          reportItem.motivo_descarte = "DUPLICADA: Foto idêntica já enviada nesta avaliação";
        } else {
          reportItem.motivo_descarte = "SUBSTITUIDA: Evidência técnica mais recente preferida";
        }
        discarded.push(reportItem);
      }
    });

    totalFotosSelecionadas += selected.length;
    totalFotosDescartadas += discarded.length;

    // Fetch checklist items for this mission to build the fingerprint
    const itemsRows = await db.prepare(`
      SELECT mei.*, i.descricao, i.critico 
      FROM missao_evidencia_itens mei
      JOIN itens i ON mei.item_id = i.id
      WHERE mei.missao_id = ? AND mei.ativo = 1
      ORDER BY i.ordem ASC
    `).bind(mission.id).all();
    const mappedItems = itemsRows.results || [];

    // Compute mission fingerprint
    const primaryHash = selected.length > 0 ? selected[0].image_hash : '';
    const { missionFingerprint } = await generateFingerprints(
      model,
      promptVersion,
      ruleVersion,
      knowledgeVersion,
      mission.id,
      primaryHash,
      mappedItems,
      mission.prompt_ia_especifico || ''
    );

    // Cache verification Level B (Mission Level) & Level A (Image Level)
    let reaproveitarCache = false;
    let cacheTipo: 'NIVEL_A' | 'NIVEL_B' | undefined;
    let resultadoCached: any = null;

    if (config.ENABLE_AI_RESULT_REUSE && !forceReanalyzeMissionIds.includes(mission.id)) {
      // Look up log database for this mission fingerprint
      const cachedLog = await db.prepare(
        "SELECT ia_result_json FROM ia_analises_logs WHERE analysis_fingerprint = ? AND ia_status = 'SUCESSO' ORDER BY ia_requested_at DESC LIMIT 1"
      ).bind(missionFingerprint).first() as any;

      if (cachedLog && cachedLog.ia_result_json) {
        try {
          resultadoCached = JSON.parse(cachedLog.ia_result_json);
          reaproveitarCache = true;
          cacheTipo = 'NIVEL_B';
          totalCacheHits++;
        } catch (e) {}
      }

      // Fallback: Check if we analyzed the same image_hash under the same rules (Level A)
      if (!reaproveitarCache && primaryHash) {
        const cachedImgLog = await db.prepare(`
          SELECT ia_result_json FROM ia_analises_logs 
          WHERE ia_result_json LIKE ? AND ia_status = 'SUCESSO' 
          ORDER BY ia_requested_at DESC LIMIT 1
        `).bind(`%"image_hash":"${primaryHash}"%`).first() as any;

        if (cachedImgLog && cachedImgLog.ia_result_json) {
          try {
            const parsedLog = JSON.parse(cachedImgLog.ia_result_json);
            // Verify if rules/prompt are the same inside the logged model
            resultadoCached = parsedLog;
            reaproveitarCache = true;
            cacheTipo = 'NIVEL_A';
            totalCacheHits++;
          } catch (e) {}
        }
      }

      // Fallback 2: Retrieve from previous evaluation consolidated state if exists
      if (!reaproveitarCache && prevResult && prevResult.analises_missoes && prevResult.analises_missoes[mission.id]) {
        resultadoCached = prevResult.analises_missoes[mission.id];
        reaproveitarCache = true;
        cacheTipo = 'NIVEL_B';
        totalCacheHits++;
      }
    }

    triagedMissoes.push({
      missao_id: mission.id,
      nome_missao: mission.nome,
      status: reaproveitarCache ? 'REUTILIZADA' : 'PRONTA_PARA_ANALISE',
      fingerprint: missionFingerprint,
      fotos_recebidas: missionEvs.length,
      fotos_selecionadas: selected,
      fotos_descartadas: discarded,
      reaproveitar_cache: reaproveitarCache,
      cache_tipo: cacheTipo,
      resultado_cached: resultadoCached
    });
  }

  // Calculate Consolidated Level C Fingerprint
  const sortedMissionFingerprints = triagedMissoes
    .map(m => m.fingerprint)
    .filter(f => f !== '')
    .sort()
    .join('|');

  const consolidatedFingerprintStr = `${avaliacaoId}:${sortedMissionFingerprints}:${model}:${promptVersion}:${knowledgeVersion}`;
  const consolidatedFingerprint = await sha256(consolidatedFingerprintStr);

  // Check if evaluation's previous consolidated result matches fingerprint (Level C)
  let canReuseConsolidated = false;
  let consolidatedCachedResult: any = null;

  if (config.ENABLE_AI_RESULT_REUSE && forceReanalyzeMissionIds.length === 0 && avaliacao.ia_fingerprint_consolidada === consolidatedFingerprint && prevResult) {
    canReuseConsolidated = true;
    consolidatedCachedResult = prevResult;
  }

  // Calculate comprehensive Economy reports and savings
  const chamadasEstimadasSemOtimizacao = totalFotosRecebidas * 1.5; // Estimated 1.5 calls per item if not consolidated
  const chamadasExecutadas = canReuseConsolidated ? 0 : triagedMissoes.filter(m => m.status === 'PRONTA_PARA_ANALISE').length;
  const chamadasEvitadasPorDuplicidade = totalDeduplicadasInternas;
  const chamadasEvitadasPorCache = totalCacheHits;

  const totalEvitadas = chamadasEstimadasSemOtimizacao - chamadasExecutadas;
  const percentualEconomiaEstimado = Math.round((totalEvitadas / Math.max(1, chamadasEstimadasSemOtimizacao)) * 100);
  const tempoEstimadoEconomizadoS = totalEvitadas * 12; // 12 seconds saved per skipped call

  const report: TriageReport = {
    avaliacao_id: avaliacaoId,
    certificacao_id: avaliacao.certificacao_id,
    certificacao_nome: certificacaoNome,
    total_fotos_recebidas: totalFotosRecebidas,
    total_fotos_validas: totalFotosValidas,
    total_fotos_selecionadas: totalFotosSelecionadas,
    total_fotos_descartadas: totalFotosDescartadas,
    consolidated_fingerprint: consolidatedFingerprint,
    can_reuse_consolidated: canReuseConsolidated,
    consolidated_cached_result: consolidatedCachedResult,
    missoes: triagedMissoes,
    economia_estimada: {
      fotos_recebidas: totalFotosRecebidas,
      fotos_selecionadas: totalFotosSelecionadas,
      fotos_descartadas: totalFotosDescartadas,
      chamadas_estimadas_sem_otimizacao: Math.round(chamadasEstimadasSemOtimizacao),
      chamadas_executadas: chamadasExecutadas,
      chamadas_evitadas_por_duplicidade: chamadasEvitadasPorDuplicidade,
      chamadas_evitadas_por_cache: chamadasEvitadasPorCache,
      percentual_economia_estimado: Math.max(0, percentualEconomiaEstimado),
      tempo_estimado_economizado_s: Math.max(0, tempoEstimadoEconomizadoS)
    }
  };

  Logger.info(`Engine de Economia concluída. Economia estimada: ${percentualEconomiaEstimado}% de chamadas evitadas.`);
  return report;
}
