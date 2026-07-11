import { initDb, Env, jsonResponse } from '../../_db';
import { getAppConfig } from '../../_config';
import { logEvent, LogLevel } from '../../_logger';
import { GoogleGenAI, Type } from '@google/genai';
import { runEvidenceTriage } from '../../_economy_engine';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";

  try {
    await initDb(env.DB);
    const config = getAppConfig(env);

    // Parse request body
    const { 
      avaliacao_id, 
      tipo_analise, 
      missoes_modificadas = [], 
      confirmado_pago, 
      usuario_id, 
      perfil_usuario 
    } = await request.json() as { 
      avaliacao_id: string; 
      tipo_analise: 'ANALISE_CONSOLIDADA' | 'REANALISE_PARCIAL'; 
      missoes_modificadas?: string[];
      confirmado_pago?: boolean;
      usuario_id?: string;
      perfil_usuario?: string;
    };

    if (!avaliacao_id) {
      return jsonResponse({ success: false, error: "Parâmetro 'avaliacao_id' é obrigatório." }, 400);
    }

    if (!tipo_analise || (tipo_analise !== 'ANALISE_CONSOLIDADA' && tipo_analise !== 'REANALISE_PARCIAL')) {
      return jsonResponse({ success: false, error: "Parâmetro 'tipo_analise' deve ser 'ANALISE_CONSOLIDADA' ou 'REANALISE_PARCIAL'." }, 400);
    }

    const finalUserId = usuario_id || "sistema-ia-user";
    const finalPerfil = perfil_usuario || "SISTEMA";

    // 1. Fetch evaluation and certification
    const avaliacao = await env.DB.prepare(
      "SELECT * FROM avaliacoes WHERE id = ?"
    ).bind(avaliacao_id).first() as any;

    if (!avaliacao) {
      return jsonResponse({ success: false, error: "Avaliação não encontrada." }, 404);
    }

    const cert = await env.DB.prepare(
      "SELECT nome FROM certificacoes WHERE id = ?"
    ).bind(avaliacao.certificacao_id).first() as any;

    if (!cert) {
      return jsonResponse({ success: false, error: "Certificação não encontrada." }, 404);
    }

    // 2. Validate rate limits
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);

    const { count_ia_dia } = await env.DB.prepare(`
      SELECT COUNT(*) as count_ia_dia FROM ia_analises_logs
      WHERE ia_requested_at LIKE ? AND ia_status = 'SUCESSO'
    `).bind(`${todayStr}%`).first() as any;

    const { count_ia_mes } = await env.DB.prepare(`
      SELECT COUNT(*) as count_ia_mes FROM ia_analises_logs
      WHERE ia_requested_at LIKE ? AND ia_status = 'SUCESSO'
    `).bind(`${monthStr}%`).first() as any;

    const { count_ia_user_dia } = await env.DB.prepare(`
      SELECT COUNT(*) as count_ia_user_dia FROM ia_analises_logs
      WHERE ia_requested_at LIKE ? AND ia_requested_by = ? AND ia_status = 'SUCESSO'
    `).bind(`${todayStr}%`, finalUserId).first() as any;

    if ((count_ia_dia || 0) >= config.MAX_ANALISES_IA_DIA || (count_ia_mes || 0) >= config.MAX_ANALISES_IA_MES) {
      return jsonResponse({
        success: false,
        error: "Limite global de análises IA atingido. Faça revisão manual pelo CQ/Analista."
      }, 429);
    }

    if ((count_ia_user_dia || 0) >= config.MAX_ANALISES_IA_POR_USUARIO_DIA) {
      return jsonResponse({
        success: false,
        error: "Limite diário de análises IA por usuário excedido. Faça revisão manual pelo CQ/Analista."
      }, 429);
    }

    // Update status to 'TRIAGEM' in DB
    await env.DB.prepare(
      "UPDATE avaliacoes SET ia_status_consolidado = 'TRIAGEM', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(avaliacao_id).run();

    // 3. Run Central Economy Engine Triage
    let forceReanalyzeMissionIds: string[] = [];
    if (tipo_analise === 'REANALISE_PARCIAL' && missoes_modificadas.length > 0) {
      forceReanalyzeMissionIds = missoes_modificadas;
    }

    const triageReport = await runEvidenceTriage(
      env.DB,
      config,
      avaliacao_id,
      "gemini-3.5-flash",
      "2.1.0-consolidado",
      "v2",
      "kb-v1",
      forceReanalyzeMissionIds
    );

    // 4. If LEVEL C reuse is possible, return early! (Integral reuse)
    if (triageReport.can_reuse_consolidated && triageReport.consolidated_cached_result) {
      const reusedResult = triageReport.consolidated_cached_result;

      // Ensure status is marked properly
      await env.DB.prepare(`
        UPDATE avaliacoes 
        SET 
          ia_status_consolidado = 'PENDENTE_REVISAO_CQ',
          ia_resultado_consolidado_json = ?,
          ia_reanalise_pendente = 0,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).bind(
        JSON.stringify(reusedResult),
        avaliacao_id
      ).run();

      await logEvent(env, {
        tipo: LogLevel.INFO,
        evento: `Análise IA consolidada REAPROVEITADA INTEGRALMENTE (Level C cache)`,
        usuario_id: finalUserId,
        perfil: finalPerfil,
        ip: clientIp,
        userAgent,
        metadata: { avaliacao_id, cached_fingerprint: triageReport.consolidated_fingerprint }
      });

      return jsonResponse({
        success: true,
        tipo_analise,
        ia_status_consolidado: 'PENDENTE_REVISAO_CQ',
        total_analisadas: 0,
        total_reaproveitadas: triageReport.total_fotos_selecionadas,
        economia_estimada_usd: triageReport.total_fotos_selecionadas * 0.0005,
        resultado: reusedResult
      });
    }

    // 5. Partition missions into SEM_EVIDENCIA, REUTILIZADA, and PRONTA_PARA_ANALISE
    const analises_missoes: Record<string, any> = {};
    const missoesParaAnalisar: any[] = [];
    let totalReusedCount = 0;
    let totalMissionsAnalyzedCount = 0;
    let totalEstimatedSavings = 0.0;

    for (const triagedM of triageReport.missoes) {
      if (triagedM.status === 'SEM_EVIDENCIA') {
        analises_missoes[triagedM.missao_id] = {
          missao_id: triagedM.missao_id,
          nome_missao: triagedM.nome_missao,
          status: "SEM_EVIDENCIA",
          aprovada: false,
          justificativa: "Nenhuma evidência/foto foi submetida para esta missão.",
          risco_lgpd: "BAIXO",
          risco_lgpd_tipos: [],
          itens: {}
        };
      } else if (triagedM.status === 'REUTILIZADA') {
        totalReusedCount++;
        totalEstimatedSavings += 0.0005;

        // Construct standard mapped items if present
        const cachedItemsMap: Record<string, any> = {};
        if (triagedM.resultado_cached?.itens) {
          Object.entries(triagedM.resultado_cached.itens).forEach(([itemId, val]: [string, any]) => {
            cachedItemsMap[itemId] = val;
          });
        }

        analises_missoes[triagedM.missao_id] = {
          missao_id: triagedM.missao_id,
          nome_missao: triagedM.nome_missao,
          status: "REUTILIZADA",
          aprovada: triagedM.resultado_cached?.aprovada ?? false,
          justificativa: triagedM.resultado_cached?.justificativa ?? "Resultado técnico reaproveitado dos servidores de cache.",
          risco_lgpd: triagedM.resultado_cached?.risco_lgpd ?? "BAIXO",
          risco_lgpd_tipos: triagedM.resultado_cached?.risco_lgpd_tipos ?? [],
          fingerprint: triagedM.fingerprint,
          reaproveitada: true,
          imagem_utilizada: {
            id: triagedM.fotos_selecionadas[0]?.id,
            r2_key: triagedM.fotos_selecionadas[0]?.r2_key,
            image_hash: triagedM.fotos_selecionadas[0]?.image_hash,
            imagem_repetida: triagedM.fotos_selecionadas[0]?.duplicada_externa ? 1 : 0,
            imagem_repetida_alerta: triagedM.fotos_selecionadas[0]?.duplicada_externa_alert || ''
          },
          itens: cachedItemsMap
        };
      } else if (triagedM.status === 'PRONTA_PARA_ANALISE') {
        // Load mapped items and rules for this mission
        const itemsRows = await env.DB.prepare(`
          SELECT mei.*, i.descricao, i.critico 
          FROM missao_evidencia_itens mei
          JOIN itens i ON mei.item_id = i.id
          WHERE mei.missao_id = ? AND mei.ativo = 1
          ORDER BY i.ordem ASC
        `).bind(triagedM.missao_id).all();
        const mappedItems = itemsRows.results || [];

        const kbRows = await env.DB.prepare(
          "SELECT * FROM knowledge_base WHERE ativo = 1 AND (tipo_certificacao IS NULL OR tipo_certificacao = '' OR tipo_certificacao = ?)"
        ).bind(cert.nome).all();
        const matchedRules = kbRows.results?.filter((rule: any) => {
          return mappedItems.some((item: any) => {
            return rule.checklist_item === item.descricao || rule.categoria === triagedM.nome_missao;
          });
        }) || [];

        // Load original mission details
        const missionRow = await env.DB.prepare(
          "SELECT * FROM missoes_evidencias WHERE id = ?"
        ).bind(triagedM.missao_id).first() as any;

        missoesParaAnalisar.push({
          mission: missionRow || { id: triagedM.missao_id, nome: triagedM.nome_missao },
          primaryEv: triagedM.fotos_selecionadas[0],
          mappedItems,
          matchedRules,
          fingerprint: triagedM.fingerprint,
          isDuplicate: triagedM.fotos_selecionadas[0]?.duplicada_externa ? 1 : 0,
          duplicateAlert: triagedM.fotos_selecionadas[0]?.duplicada_externa_alert || ''
        });
      }
    }

    // Paid cost warnings
    const isPaid = (count_ia_dia || 0) >= 10;
    const exigirConfirmacao = config.ENABLE_AI_COST_CONFIRMATION;
    if (missoesParaAnalisar.length > 0 && isPaid && exigirConfirmacao && !confirmado_pago) {
      // Revert status to PENDENTE in DB since we aborted analysis for warning
      await env.DB.prepare(
        "UPDATE avaliacoes SET ia_status_consolidado = 'PENDENTE', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(avaliacao_id).run();

      return jsonResponse({
        success: false,
        requires_confirmation: true,
        error: "Esta análise consolidada pode consumir créditos adicionais de IA. Deseja continuar?"
      }, 200);
    }

    // Update status to 'EM_ANALISE' in DB
    await env.DB.prepare(
      "UPDATE avaliacoes SET ia_status_consolidado = 'EM_ANALISE', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(avaliacao_id).run();

    let ia_error_code: string | null = null;
    let ia_status_final = 'CONCLUIDA';
    let rawResponseText = "";
    let cost = 0.0;

    // 6. Execute IA analysis only for the missions in missoesParaAnalisar
    if (missoesParaAnalisar.length > 0) {
      if (config.ENABLE_EVIDENCE_AI && env.GEMINI_API_KEY) {
        const aiClient = new GoogleGenAI({
          apiKey: env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const contentParts: any[] = [];

        let promptText = `Você é um Engenheiro de Telecomunicações especialista em Controle de Qualidade de Infraestrutura de Fibra Óptica (GPON/HFC).
Você deve realizar uma auditoria consolidada e rigorosa das evidências fotográficas enviadas para uma avaliação de certificação técnica.

Para cada imagem enviada, faça uma análise técnica baseando-se estritamente nas regras e itens especificados para cada missão.

--- DIRETRIZ DE PRIVACIDADE E LGPD ---
É terminantemente proibido extrair, processar, reportar ou persistir na justificativa quaisquer dados pessoais (como rostos de técnicos/clientes, CPFs, nomes, telefones, ou dados residenciais específicos). Se algum dado pessoal estiver exposto, ignore-o inteiramente.

Instruções para análise técnica de cada missão individual:
`;

        for (let idx = 0; idx < missoesParaAnalisar.length; idx++) {
          const mObj = missoesParaAnalisar[idx];
          const mission = mObj.mission;
          const mappedItems = mObj.mappedItems;
          const matchedRules = mObj.matchedRules;

          promptText += `\n\n==================================================
[IMAGEM INDICE ${idx}] CORRESPONDE À MISSÃO ID: "${mission.id}"
Nome da Missão: ${mission.nome}
Grupo de Evidência: ${mission.grupo_evidencia || ''}
Orientação Fotográfica: ${mission.orientacao_foto || ''}
Prompt Específico da Missão: ${mission.prompt_ia_especifico || ''}

Itens do Checklist a serem julgados para esta missão:
`;

          for (const it of mappedItems) {
            promptText += `- Item ID [${it.item_id}]: "${it.descricao}" (Crítico: ${it.critico === 1 ? 'SIM' : 'NÃO'})\n`;
          }

          if (matchedRules.length > 0) {
            promptText += `\nRegras de Conformidade da Base de Conhecimento aplicáveis:\n`;
            for (const r of matchedRules) {
              promptText += `* Regra: "${r.titulo}"\n  - Critérios de Conformidade: ${r.regra || r.descricao || ''}\n`;
            }
          }
          promptText += `==================================================`;
        }

        promptText += `\n\nPor favor, retorne uma resposta no formato estritamente JSON contendo a análise para cada uma das missões listadas.
Exemplo de formato esperado:
{
  "missoes": [
    {
      "missao_id": "id_da_missao",
      "aprovada": true,
      "justificativa": "Sua justificativa técnica, em português, baseada estritamente nas regras.",
      "risco_lgpd": "BAIXO",
      "risco_lgpd_tipos": [],
      "itens": [
        {
          "item_id": 123,
          "atende": true,
          "observacao": "Fita devidamente instalada em conformidade técnica."
        }
      ]
    }
  ]
}`;

        contentParts.push({ text: promptText });

        // Load images from bucket
        const bucket = env.EVIDENCIAS_BUCKET || env.BUCKET || env.R2;
        if (bucket) {
          for (let idx = 0; idx < missoesParaAnalisar.length; idx++) {
            const mObj = missoesParaAnalisar[idx];
            const primaryEv = mObj.primaryEv;
            
            try {
              const object = await bucket.get(primaryEv.r2_key);
              if (object) {
                const imageBuffer = await object.arrayBuffer();
                const base64Data = arrayBufferToBase64(imageBuffer);
                const mimeType = primaryEv.mime_type || "image/jpeg";

                contentParts.push({ text: `\n[IMAGEM INDICE ${idx}] - EVIDÊNCIA FOTOGRÁFICA DA MISSÃO ID: "${mObj.mission.id}"` });
                contentParts.push({
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                });
              } else {
                contentParts.push({ text: `\n[IMAGEM INDICE ${idx}] - [Aviso: Arquivo de imagem com chave ${primaryEv.r2_key} não pôde ser lido no R2 bucket]` });
              }
            } catch (err: any) {
              console.error(`Erro ao carregar imagem ${primaryEv.r2_key} do R2:`, err);
              contentParts.push({ text: `\n[IMAGEM INDICE ${idx}] - [Erro de leitura do arquivo no bucket R2]` });
            }
          }
        }

        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            missoes: {
              type: Type.ARRAY,
              description: "Resultados da análise detalhada por missão",
              items: {
                type: Type.OBJECT,
                properties: {
                  missao_id: { type: Type.STRING },
                  aprovada: { type: Type.BOOLEAN },
                  justificativa: { type: Type.STRING },
                  risco_lgpd: { type: Type.STRING },
                  risco_lgpd_tipos: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  itens: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item_id: { type: Type.INTEGER },
                        atende: { type: Type.BOOLEAN },
                        observacao: { type: Type.STRING }
                      },
                      required: ["item_id", "atende", "observacao"]
                    }
                  }
                },
                required: ["missao_id", "aprovada", "justificativa", "risco_lgpd", "itens"]
              }
            }
          },
          required: ["missoes"]
        };

        try {
          const response = await aiClient.models.generateContent({
            model: "gemini-3.5-flash",
            contents: contentParts,
            config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema
            }
          });

          rawResponseText = response.text || "";
          cost = missoesParaAnalisar.length * 0.0005;

          let parsed: any = null;
          const jsonMatch = rawResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            parsed = JSON.parse(rawResponseText);
          }

          if (parsed && parsed.missoes && Array.isArray(parsed.missoes)) {
            for (const mRes of parsed.missoes) {
              const matchingAnalysis = missoesParaAnalisar.find(item => item.mission.id === mRes.missao_id);
              if (matchingAnalysis) {
                totalMissionsAnalyzedCount++;

                const itemsMap: Record<string, any> = {};
                if (mRes.itens && Array.isArray(mRes.itens)) {
                  for (const it of mRes.itens) {
                    itemsMap[it.item_id] = {
                      atende: it.atende,
                      observacao: it.observacao
                    };
                  }
                }

                analises_missoes[mRes.missao_id] = {
                  missao_id: mRes.missao_id,
                  nome_missao: matchingAnalysis.mission.nome,
                  status: "CONCLUIDA",
                  aprovada: mRes.aprovada,
                  justificativa: mRes.justificativa,
                  risco_lgpd: mRes.risco_lgpd || "BAIXO",
                  risco_lgpd_tipos: mRes.risco_lgpd_tipos || [],
                  fingerprint: matchingAnalysis.fingerprint,
                  reaproveitada: false,
                  imagem_utilizada: {
                    id: matchingAnalysis.primaryEv.id,
                    r2_key: matchingAnalysis.primaryEv.r2_key,
                    image_hash: matchingAnalysis.primaryEv.image_hash,
                    imagem_repetida: matchingAnalysis.isDuplicate,
                    imagem_repetida_alerta: matchingAnalysis.duplicateAlert
                  },
                  itens: itemsMap
                };

                // Sync single evidence status for backward-compatibility with other views
                const newEvStatus = mRes.aprovada ? 'APROVADO_IA' : 'REPROVADO_IA';
                
                // Update "evidencias" table if exists
                await env.DB.prepare(
                  "UPDATE evidencias SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                ).bind(newEvStatus, matchingAnalysis.primaryEv.id).run();

                // Update "ia_evidencias" table if exists
                await env.DB.prepare(
                  "UPDATE ia_evidencias SET status_ia = ?, resultado_ia = ?, justificativa_ia = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                ).bind(newEvStatus, mRes.aprovada ? 'APROVADO' : 'REPROVADO', mRes.justificativa, matchingAnalysis.primaryEv.id).run();

                // Save to individual evidence logs
                await env.DB.prepare(`
                  INSERT INTO ia_analises_logs (
                    evidencia_id, ia_model, ia_prompt_version, ia_requested_by, ia_requested_at,
                    ia_status, ia_tokens_estimated, ia_result_json, tipo_analise, analysis_fingerprint
                  ) VALUES (?, ?, '2.1.0-consolidado', ?, CURRENT_TIMESTAMP, 'SUCESSO', 500, ?, 'CONSOLIDADA_MEMBRO', ?)
                `).bind(
                  matchingAnalysis.primaryEv.id,
                  "gemini-3.5-flash",
                  finalUserId,
                  JSON.stringify(analises_missoes[mRes.missao_id]),
                  matchingAnalysis.fingerprint
                ).run();
              }
            }
          } else {
            throw new Error("Formato de resposta do Gemini inválido.");
          }

        } catch (geminiErr: any) {
          console.error("Erro na chamada de IA consolidada:", geminiErr);
          ia_status_final = 'ERRO';
          ia_error_code = geminiErr.message || "GEMINI_API_ERROR";
        }
      } else {
        ia_status_final = 'ERRO';
        ia_error_code = "GEMINI_API_KEY_MISSING";
      }
    }

    // Determine final status
    const overall_status = ia_status_final === 'ERRO' ? 'ERRO' : 'PENDENTE_REVISAO_CQ';

    const finalResultJson = {
      status_consolidado: overall_status,
      data_analise: new Date().toISOString(),
      reaproveitadas_count: totalReusedCount,
      analisadas_count: totalMissionsAnalyzedCount,
      economia_estimada_usd: totalEstimatedSavings,
      analises_missoes
    };

    // 7. Save consolidated result into 'avaliacoes'
    await env.DB.prepare(`
      UPDATE avaliacoes 
      SET 
        ia_status_consolidado = ?,
        ia_resultado_consolidado_json = ?,
        ia_fingerprint_consolidada = ?,
        ia_reanalise_pendente = 0,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(
      overall_status,
      JSON.stringify(finalResultJson),
      await sha256(JSON.stringify(analises_missoes)),
      avaliacao_id
    ).run();

    // Log the consolidated call execution in ia_analises_logs
    await env.DB.prepare(`
      INSERT INTO ia_analises_logs (
        evidencia_id, ia_model, ia_prompt_version, ia_requested_by, ia_requested_at,
        ia_status, ia_tokens_estimated, ia_result_json, ia_error_code,
        tipo_analise, analysis_fingerprint, reaproveitada, economia_estimada
      ) VALUES (?, ?, '2.1.0-consolidado', ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `consolidada-${avaliacao_id}`,
      "gemini-3.5-flash",
      finalUserId,
      ia_status_final === 'ERRO' ? 'FALHA' : 'SUCESSO',
      missoesParaAnalisar.length * 1000,
      JSON.stringify(finalResultJson),
      ia_error_code,
      tipo_analise,
      await sha256(JSON.stringify(analises_missoes)),
      totalReusedCount > 0 ? 1 : 0,
      totalEstimatedSavings
    ).run();

    // Audit Log event
    await logEvent(env, {
      tipo: ia_status_final === 'ERRO' ? LogLevel.ERROR : LogLevel.INFO,
      evento: `Execução de análise IA de evidências consolidada: ${tipo_analise}`,
      usuario_id: finalUserId,
      perfil: finalPerfil,
      ip: clientIp,
      userAgent,
      metadata: { 
        avaliacao_id, 
        status: overall_status, 
        analisadas: totalMissionsAnalyzedCount, 
        reaproveitadas: totalReusedCount, 
        savings_usd: totalEstimatedSavings 
      }
    });

    if (ia_status_final === 'ERRO') {
      return jsonResponse({
        success: false,
        error: "Falha ao processar análise consolidada de IA: " + (ia_error_code || "Desconhecido")
      }, 500);
    }

    return jsonResponse({
      success: true,
      tipo_analise,
      ia_status_consolidado: overall_status,
      total_analisadas: totalMissionsAnalyzedCount,
      total_reaproveitadas: totalReusedCount,
      economia_estimada_usd: totalEstimatedSavings,
      resultado: finalResultJson
    });

  } catch (globalErr: any) {
    console.error("Erro global no endpoint consolidado:", globalErr);
    return jsonResponse({
      success: false,
      error: "Erro interno no servidor: " + globalErr.message
    }, 500);
  }
};
