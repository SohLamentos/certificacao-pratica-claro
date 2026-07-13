import { initDb, Env, jsonResponse, getLocalDateString } from '../../_db';
import { getAppConfig } from '../../_config';
import { logEvent, LogLevel } from '../../_logger';
import { GoogleGenAI, Type } from '@google/genai';
import { calculateQualityScore } from '../../_economy_engine';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function generateBlurredSvg(base64Data: string, mimeType: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <filter id="blurFilter">
    <feGaussianBlur stdDeviation="20" />
  </filter>
  <image href="data:${mimeType};base64,${base64Data}" width="100%" height="100%" filter="url(#blurFilter)"/>
</svg>`;
}

function scrubPersonalData(text: string): string {
  if (!text) return text;
  return text
    // Replace CPFs (e.g., 000.000.000-00)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF_MASCARADO]')
    // Replace CNPJs (e.g., 00.000.000/0000-00)
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ_MASCARADO]')
    // Replace emails
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_MASCARADO]')
    // Replace phone numbers
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-\d{4}\b/g, '[TELEFONE_MASCARADO]');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";

  try {
    await initDb(env.DB);
    const config = getAppConfig(env);

    const { evidencia_id, confirmado_pago, usuario_id, perfil_usuario } = await request.json() as { 
      evidencia_id: string; 
      confirmado_pago?: boolean;
      usuario_id?: string;
      perfil_usuario?: string;
    };

    if (!evidencia_id) {
      return jsonResponse({ success: false, error: "Parâmetro 'evidencia_id' é obrigatório." }, 400);
    }

    const finalUserId = usuario_id || "sistema-ia-user";
    const finalPerfil = perfil_usuario || "SISTEMA";

    // Generate login_hash using Web Crypto API
    if (!env.LGPD_HASH_SALT) {
      return jsonResponse({
        success: false,
        error: "Configuração Ausente",
        message: "Erro de Configuração: A chave LGPD_HASH_SALT não foi configurada no ambiente."
      }, 500);
    }
    const salt = env.LGPD_HASH_SALT;
    const input = `${finalUserId}:${salt}`;
    const enc = new TextEncoder();
    const hashData = enc.encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');

    // 1. Buscar a evidência no banco de dados
    const evidence = await env.DB.prepare(
      "SELECT * FROM ia_evidencias WHERE id = ?"
    ).bind(evidencia_id).first() as any;

    if (!evidence) {
      return jsonResponse({ success: false, error: "Evidência não encontrada." }, 404);
    }

    // 2. Bloquear reprocessamento se já analisado
    if (evidence.status_ia !== 'PENDENTE') {
      return jsonResponse({
        success: false,
        error: "Esta evidência já possui uma análise concluída e não pode ser reanalisada."
      }, 400);
    }

    // 3. Obter ou calcular o hash do arquivo
    let ia_hash_arquivo = evidence.ia_hash_arquivo;
    if (!ia_hash_arquivo) {
      const hashInput = `${evidence.arquivo_key}-${evidence.tamanho_final || evidence.tamanho || 0}`;
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(hashInput);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      ia_hash_arquivo = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- CENTRAL ECONOMY ENGINE RULES INTEGRATION ---
    // Rule 4 & 6: Quality Score & Invalid checking
    const qScore = calculateQualityScore({
      image_hash: ia_hash_arquivo,
      tamanho_original: evidence.tamanho_final || evidence.tamanho || 100000,
      largura: evidence.largura,
      altura: evidence.altura,
      mime_type: evidence.tipo_arquivo
    });

    if (qScore < 20) {
      // Mark as rejected immediately due to poor technical quality
      const rejectJustificativa = `REPROVADO AUTOMATICAMENTE: Evidência técnica com qualidade inadequada (score: ${qScore}/100). Verifique se a foto possui boa iluminação, foco adequado, formato válido e resolução mínima.`;
      
      await env.DB.prepare(`
        UPDATE ia_evidencias
        SET status_ia = 'REPROVADO_IA',
            resultado_ia = 'REPROVADO',
            confianca_ia = 1.0,
            justificativa_ia = ?,
            ia_hash_arquivo = ?,
            ia_origem = 'SISTEMA_REJEICAO',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(rejectJustificativa, ia_hash_arquivo, evidencia_id).run();

      await logEvent(env, {
        tipo: LogLevel.WARNING,
        evento: `Evidência técnica rejeitada por baixa qualidade técnica (Score: ${qScore})`,
        usuario_id: finalUserId,
        perfil: finalPerfil,
        ip: clientIp,
        userAgent,
        metadata: { evidencia_id, score: qScore }
      });

      const updatedRecord = await env.DB.prepare("SELECT * FROM ia_evidencias WHERE id = ?").bind(evidencia_id).first() as any;
      return jsonResponse({
        success: true,
        reused: false,
        evidence: updatedRecord
      });
    }

    // Rule 5: Duplication check (external duplicate fraud warning)
    const countOtherEvs = await env.DB.prepare(
      "SELECT COUNT(DISTINCT avaliacao_id) as cnt FROM evidencias WHERE image_hash = ? AND avaliacao_id != ? AND arquivo_excluido = 0"
    ).bind(ia_hash_arquivo, evidence.certificacao_id).first() as any;

    const countOtherIaEvs = await env.DB.prepare(
      "SELECT COUNT(DISTINCT certificacao_id) as cnt FROM ia_evidencias WHERE ia_hash_arquivo = ? AND certificacao_id != ?"
    ).bind(ia_hash_arquivo, evidence.certificacao_id).first() as any;

    const otherCount = (countOtherEvs?.cnt || 0) + (countOtherIaEvs?.cnt || 0);
    let duplicateAlert = "";
    if (otherCount > 0) {
      duplicateAlert = `Possível Reuso de Evidência: Esta mesma foto já foi enviada em ${otherCount} outra(s) avaliação(ões) distinta(s)!`;
      await env.DB.prepare(`
        UPDATE ia_evidencias
        SET imagem_repetida = 1,
            imagem_repetida_alerta = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(duplicateAlert, evidencia_id).run();
    }

    // 4. Se já existir análise para o mesmo hash, reutilizar resultado (Reuso de análise, custo zero)
    const cachedEvidence = await env.DB.prepare(`
      SELECT status_ia, resultado_ia, confianca_ia, justificativa_ia, ia_modelo
      FROM ia_evidencias
      WHERE ia_hash_arquivo = ? AND status_ia != 'PENDENTE' AND resultado_ia IS NOT NULL
      LIMIT 1
    `).bind(ia_hash_arquivo).first() as any;

    if (cachedEvidence) {
      const nowStr = new Date().toISOString();
      const updatedJustificativa = `${cachedEvidence.justificativa_ia}\n\n[Análise reaproveitada de imagem já analisada.]`;

      await env.DB.prepare(`
        UPDATE ia_evidencias
        SET status_ia = ?,
            resultado_ia = ?,
            confianca_ia = ?,
            justificativa_ia = ?,
            ia_analisado_em = ?,
            ia_modelo = ?,
            ia_custo_estimado = ?,
            ia_hash_arquivo = ?,
            ia_origem = 'CACHE',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        cachedEvidence.status_ia,
        cachedEvidence.resultado_ia,
        cachedEvidence.confianca_ia,
        updatedJustificativa,
        nowStr,
        cachedEvidence.ia_modelo,
        0.0, // Custo zero para cache
        ia_hash_arquivo,
        evidencia_id
      ).run();

      // Registrar auditoria para reuso de cache: ANALISE_IA_REUTILIZADA
      await logEvent(env, {
        tipo: LogLevel.INFO,
        evento: `Análise IA de etapa ${evidence.etapa} reaproveitada via cache`,
        usuario_id: finalUserId,
        perfil: finalPerfil,
        ip: clientIp,
        userAgent,
        metadata: { evidencia_id, hash: ia_hash_arquivo }
      });

      // Buscar registro atualizado
      const updatedRecord = await env.DB.prepare("SELECT * FROM ia_evidencias WHERE id = ?").bind(evidencia_id).first() as any;

      return jsonResponse({
        success: true,
        reused: true,
        evidence: updatedRecord
      });
    }

    // 5. Validar limites de IA (Bloqueio duro se atingido)
    const todayStr = getLocalDateString(); // YYYY-MM-DD
    const monthStr = todayStr.substring(0, 7); // YYYY-MM

    // Query daily and monthly active executions
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
      await logEvent(env, {
        tipo: LogLevel.WARNING,
        evento: `Tentativa de acionar IA bloqueada por cota diária/mensal excedida`,
        usuario_id: finalUserId,
        perfil: finalPerfil,
        ip: clientIp,
        userAgent,
        metadata: { count_ia_dia, max: config.MAX_ANALISES_IA_DIA }
      });
      return jsonResponse({
        success: false,
        error: "Limite global de análises IA atingido. Faça revisão manual."
      }, 429);
    }

    if ((count_ia_user_dia || 0) >= config.MAX_ANALISES_IA_POR_USUARIO_DIA) {
      return jsonResponse({
        success: false,
        error: "Limite diário de análises IA por usuário excedido. Faça revisão manual."
      }, 429);
    }

    // 6. Verificar se exige confirmação de cobrança
    const isPaid = (count_ia_dia || 0) >= 10; // Simple check for free tier limit
    const exigirConfirmacao = env.ia_exigir_confirmacao_quando_pago === undefined ? true : (env.ia_exigir_confirmacao_quando_pago === true || env.ia_exigir_confirmacao_quando_pago === 1 || String(env.ia_exigir_confirmacao_quando_pago).toLowerCase() === 'true');
    if (isPaid && exigirConfirmacao && !confirmado_pago) {
      return jsonResponse({
        success: false,
        requires_confirmation: true,
        error: "Esta análise pode consumir créditos de IA. Deseja continuar?"
      }, 200);
    }

    // 7. Dynamic Rule Checking & Prompt Construction
    const avaliacao = await env.DB.prepare("SELECT certificacao_id FROM avaliacoes WHERE id = ?").bind(evidence.certificacao_id).first() as any;
    let certNome = "";
    if (avaliacao) {
      const certObj = await env.DB.prepare("SELECT nome FROM certificacoes WHERE id = ?").bind(avaliacao.certificacao_id).first() as any;
      if (certObj) certNome = certObj.nome;
    }

    // Check LGPD Data Minimization preference
    let isMinimizacaoAtiva = true;
    try {
      const minimizacaoSetting = await env.DB.prepare("SELECT valor FROM ia_lgpd_config WHERE chave = 'lgpd_minimizacao_dados'").first() as any;
      if (minimizacaoSetting) {
        isMinimizacaoAtiva = minimizacaoSetting.valor === '1';
      }
    } catch (e) {
      console.warn("LGPD minimization setting not read, using true by default", e);
    }

    let rules: any[] = [];
    let ruleSource = 'ia_regras_itens';

    if (config.ENABLE_KNOWLEDGE_BASE) {
      try {
        const kbQuery = await env.DB.prepare(`
          SELECT 
            id, tipo_certificacao, categoria, checklist_item, 
            titulo, descricao, regra as criterios_conformidade, 
            prioridade as peso
          FROM knowledge_base
          WHERE ativo = 1
            AND (tipo_certificacao IS NULL OR tipo_certificacao = '' OR tipo_certificacao = ?)
            AND (checklist_item IS NULL OR checklist_item = '' OR checklist_item = ?)
          ORDER BY prioridade DESC
        `).bind(certNome, evidence.etapa).all();
        
        if (kbQuery.results && kbQuery.results.length > 0) {
          rules = kbQuery.results;
          ruleSource = 'knowledge_base';
        }
      } catch (err) {
        console.error("Erro ao carregar regras da Knowledge Base, usando fallback:", err);
      }
    }

    // Fallback if Knowledge Base is disabled or returned no rules
    if (rules.length === 0) {
      try {
        const rulesQuery = await env.DB.prepare(`
          SELECT * FROM ia_regras_itens
          WHERE etapa = ?
            AND ativo = 1
            AND (tipo_certificacao IS NULL OR tipo_certificacao = '' OR tipo_certificacao = ?)
          ORDER BY peso DESC
        `).bind(evidence.etapa, certNome).all();
        rules = rulesQuery.results || [];
      } catch (err) {
        console.error("Erro ao carregar regras antigas:", err);
      }
    }

    // Query human feedback training examples for this stage (Supervised learning)
    const feedbackQuery = await env.DB.prepare(`
      SELECT resultado_ia, resultado_cq, correcao_cq, motivo_cq, checklist_item,
             resultado_original_ia, resultado_final_cq, motivo_divergencia
      FROM ia_feedback_treinamento
      WHERE (checklist_item = ? OR etapa = ?) AND usar_como_exemplo = 1
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(evidence.etapa, evidence.etapa).all();
    const feedbacks = feedbackQuery.results || [];

    let promptText = "";
    let ruleIdsUsed: string[] = [];

    if (rules.length > 0) {
      ruleIdsUsed = rules.map((r: any) => String(r.id));
      promptText = `Você é uma IA de controle de qualidade especializada em telecomunicações e redes.
Analise rigorosamente a imagem fornecida para a etapa de auditoria: "${evidence.etapa}".

Abaixo estão as REGRAS ESPECÍFICAS DE CONFORMIDADE E REPROVAÇÃO configuradas dinamicamente para esta etapa:
`;
      for (const r of rules) {
        let ruleTitulo = r.titulo;
        let ruleDesc = r.descricao || '';
        let ruleConf = r.criterios_conformidade || '';
        let ruleNaoConf = r.criterios_nao_conformidade || '';
        let ruleExConf = r.exemplos_conformes || '';
        let ruleExNaoConf = r.exemplos_nao_conformes || '';

        if (isMinimizacaoAtiva) {
          ruleTitulo = scrubPersonalData(ruleTitulo);
          ruleDesc = scrubPersonalData(ruleDesc);
          ruleConf = scrubPersonalData(ruleConf);
          ruleNaoConf = scrubPersonalData(ruleNaoConf);
          ruleExConf = scrubPersonalData(ruleExConf);
          ruleExNaoConf = scrubPersonalData(ruleExNaoConf);
        }

        promptText += `\n--- REGRA: ${ruleTitulo} (Peso de Importância: ${r.peso}) ---\n`;
        if (ruleDesc) {
          promptText += `Descrição: ${ruleDesc}\n`;
        }
        if (ruleConf) {
          promptText += `- Critérios de Conformidade (Aprovação): ${ruleConf}\n`;
        }
        if (ruleNaoConf) {
          promptText += `- Critérios de Não-Conformidade (Reprovação): ${ruleNaoConf}\n`;
        }
        if (ruleExConf) {
          promptText += `- Exemplos de conformidade esperados: ${ruleExConf}\n`;
        }
        if (ruleExNaoConf) {
          promptText += `- Exemplos de não-conformidade a reprovar: ${ruleExNaoConf}\n`;
        }
      }

      promptText += `\nSua análise deve basear-se estritamente nas regras acima.
Responda exclusivamente no formato JSON:
{
  "aprovado": true_ou_false,
  "confianca": valor_decimal_entre_0_e_1,
  "justificativa": "Sua justificativa técnica e analítica fundamentada sobre as regras configuradas."
}`;
    } else {
      promptText = `Você é uma IA de controle de qualidade para telecomunicações.
Analise rigorosamente esta imagem referente à etapa "${evidence.etapa}" de uma instalação de banda larga.
Responda exclusivamente no formato JSON:
{
  "aprovado": true,
  "confianca": 0.95,
  "justificativa": "Descrição do que foi verificado e por que foi aprovado."
}`;
    }

    if (isMinimizacaoAtiva) {
      promptText += `\n\n[DIRETRIZ DE PRIVACIDADE E LGPD]: Esta análise deve centrar-se estritamente nos aspectos técnicos de infraestrutura e padrões de rede/instalação observados. É TERMINANTEMENTE PROIBIDO extrair, processar, reportar ou persistir na justificativa quaisquer dados pessoais como nomes de técnicos, clientes, CPFs, RGs, emails, números de telefone, rostos ou dados residenciais específicos que eventualmente estejam expostos na evidência. Caso algum dado dessa natureza seja visível na imagem, ignore-o completamente de forma a seguir o princípio da minimização de dados do Privacy by Design.`;
    }

    // Inject human feedback learning context if available
    if (feedbacks.length > 0) {
      promptText += `\n\n--- EXEMPLOS DE APRENDIZADO COM CORREÇÕES HUMANAS (CQs) ---\n`;
      promptText += `Abaixo estão exemplos reais de auditoria onde um auditor humano de Controle de Qualidade corrigiu a IA nesta etapa ("${evidence.etapa}"). Utilize-os para recalibrar o seu julgamento e garantir a máxima conformidade técnica:\n`;
      for (let i = 0; i < feedbacks.length; i++) {
        const fb = feedbacks[i];
        let originalIa = fb.resultado_ia || fb.resultado_original_ia || "";
        let finalCq = fb.resultado_cq || fb.resultado_final_cq || "";
        let motivo = fb.correcao_cq || fb.motivo_cq || fb.motivo_divergencia || "";

        if (isMinimizacaoAtiva) {
          originalIa = scrubPersonalData(originalIa);
          finalCq = scrubPersonalData(finalCq);
          motivo = scrubPersonalData(motivo);
        }

        promptText += `\n[Exemplo de Correção ${i + 1}]
- Análise Original da IA: ${originalIa}
- Decisão Correta do Humano (CQ): ${finalCq}
- Motivo da Divergência: ${motivo}
`;
      }
      promptText += `\nConsidere as correções e motivos de divergência listados acima para evitar cometer os mesmos equívocos na análise atual.`;
    }

    // 8. Chamar Gemini API, Workers AI ou fallback para REVISÃO MANUAL
    let status_ia = 'PENDENTE_ANALISE';
    let resultado_ia = 'FALHA DE PROCESSAMENTO IA';
    let confianca_ia = 0.0;
    let justificativa_ia = "O serviço de análise automática por IA falhou ou está indisponível. Esta evidência foi encaminhada para REVISÃO MANUAL obrigatória pelo CQ.";
    let ia_modelo = "Nenhum (Serviço Offline)";
    let ia_custo_estimado = 0.0;
    let fallbackAtivo = false;
    let aiResponseStr = "";
    let aiError: any = null;
    let ia_error_code: string | null = null;

    let risco_lgpd = 'BAIXO';
    let risco_lgpd_tipos_json = '[]';
    let protected_preview_r2_key: string | null = null;
    let preview_protegido_gerado = 0;

    const bucket = env.EVIDENCIAS_BUCKET;
    if (bucket) {
      try {
        const object = await bucket.get(evidence.arquivo_key);
        if (object) {
          const imageBuffer = await object.arrayBuffer();
          const imageArray = Array.from(new Uint8Array(imageBuffer));
          const mimeType = evidence.tipo_arquivo || "image/jpeg";

          // Use Gemini API if configured & key is available
          if (config.ENABLE_EVIDENCE_AI && env.GEMINI_API_KEY) {
            const aiClient = new GoogleGenAI({
              apiKey: env.GEMINI_API_KEY,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build'
                }
              }
            });

            const base64Data = arrayBufferToBase64(imageBuffer);
            const imagePart = {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            };
            const textPart = {
              text: promptText
            };

            const responseSchema = {
              type: Type.OBJECT,
              properties: {
                aprovado: {
                  type: Type.BOOLEAN,
                  description: "true se a foto atende a todos os critérios técnicos da etapa de checklist, false se possuir não-conformidade ou se for inválida técnica"
                },
                confianca: {
                  type: Type.NUMBER,
                  description: "Valor decimal de confiança na análise entre 0.0 e 1.0"
                },
                justificativa: {
                  type: Type.STRING,
                  description: "Sua explicação em português detalhada e profissional sobre os aspectos técnicos observados na foto"
                },
                risco_lgpd: {
                  type: Type.STRING,
                  description: "Grau de risco LGPD detectado na foto. Retorne 'ALTO' se houver rostos de pessoas visíveis, documentos de identificação legíveis (como CPF, RG, CNH), ou dados pessoais sensíveis expostos. Caso contrário, retorne 'BAIXO'."
                },
                risco_lgpd_tipos: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Lista de riscos detectados. Valores possíveis: 'rosto', 'documento', 'cpf', 'dados_pessoais'."
                }
              },
              required: ["aprovado", "confianca", "justificativa", "risco_lgpd"]
            };

            const modelUsed = "gemini-3.5-flash";

            try {
              const res = await aiClient.models.generateContent({
                model: modelUsed,
                contents: { parts: [imagePart, textPart] },
                config: {
                  responseMimeType: "application/json",
                  responseSchema: responseSchema
                }
              });

              aiResponseStr = res.text || "";

              let parsed: any = null;
              const jsonMatch = aiResponseStr.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              } else {
                parsed = JSON.parse(aiResponseStr);
              }

              if (parsed && typeof parsed === 'object') {
                resultado_ia = parsed.aprovado ? 'APROVADO' : 'REPROVADO';
                status_ia = parsed.aprovado ? 'APROVADO_IA' : 'REPROVADO_IA';
                confianca_ia = typeof parsed.confianca === 'number' ? parsed.confianca : 0.90;
                justificativa_ia = parsed.justificativa || "Análise concluída via Gemini.";
                ia_modelo = modelUsed;
                ia_custo_estimado = 0.0005; // extremely low cost for Gemini 3.5 Flash

                if (config.ENABLE_LGPD_RISK_SCAN) {
                  risco_lgpd = parsed.risco_lgpd === 'ALTO' ? 'ALTO' : 'BAIXO';
                  risco_lgpd_tipos_json = JSON.stringify(parsed.risco_lgpd_tipos || []);

                  // Generate and upload blurred SVG if risk is ALTO and protected preview is enabled
                  if (risco_lgpd === 'ALTO' && config.ENABLE_PROTECTED_PREVIEW) {
                    const blurredSvg = generateBlurredSvg(base64Data, mimeType);
                    const protectedKey = `${evidence.arquivo_key}_protected.svg`;
                    
                    const encoder = new TextEncoder();
                    const svgBytes = encoder.encode(blurredSvg);
                    
                    await bucket.put(protectedKey, svgBytes, {
                      httpMetadata: { contentType: "image/svg+xml" }
                    });

                    protected_preview_r2_key = protectedKey;
                    preview_protegido_gerado = 1;
                  }
                }
              } else {
                throw new Error("Resposta inválida do Gemini API");
              }

            } catch (geminiErr: any) {
              console.error("Gemini call failed, falling back to Workers AI LLaMA-vision:", geminiErr);
              fallbackAtivo = true;
            }

          } else if (env.AI && typeof env.AI.run === 'function') {
            // Fallback to Cloudflare Workers AI
            const modelUsed = "@cf/meta/llama-3.2-11b-vision-instruct";

            try {
              const response = await env.AI.run(modelUsed, {
                prompt: promptText,
                image: imageArray
              });
              aiResponseStr = typeof response === 'string' ? response : JSON.stringify(response);

              let parsed: any = null;
              const jsonMatch = aiResponseStr.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              } else {
                parsed = JSON.parse(aiResponseStr);
              }

              if (parsed && typeof parsed === 'object') {
                resultado_ia = parsed.aprovado ? 'APROVADO' : 'REPROVADO';
                status_ia = parsed.aprovado ? 'APROVADO_IA' : 'REPROVADO_IA';
                confianca_ia = typeof parsed.confianca === 'number' ? parsed.confianca : 0.90;
                justificativa_ia = parsed.justificativa || "Análise concluída via Workers AI.";
                ia_modelo = modelUsed;
                ia_custo_estimado = isPaid ? 0.0050 : 0.0000;
              } else {
                throw new Error("Resposta inválida da API do Workers AI");
              }

            } catch (workersAiErr: any) {
              console.error("Workers AI Call failed:", workersAiErr);
              aiError = workersAiErr;
              ia_error_code = workersAiErr.message || "WORKERS_AI_ERROR";
              fallbackAtivo = true;
            }
          } else {
            fallbackAtivo = true;
          }

          // Log analytical results
          await env.DB.prepare(`
            INSERT INTO ia_analises_logs (
              evidencia_id, ia_model, ia_prompt_version, ia_requested_by, ia_requested_at,
              ia_status, ia_tokens_estimated, ia_result_json, ia_error_code
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
          `).bind(
            evidencia_id,
            ia_modelo,
            config.ENABLE_EVIDENCE_AI && env.GEMINI_API_KEY ? "2.0.0-gemini" : "1.1.0-manual",
            finalUserId,
            fallbackAtivo ? 'FALHA' : 'SUCESSO',
            350,
            aiResponseStr || null,
            ia_error_code
          ).run();

        } else {
          throw new Error("Arquivo de evidência não localizado no bucket R2");
        }
      } catch (err: any) {
        console.error("General analysis or object fetch error:", err);
        fallbackAtivo = true;
      }
    } else {
      fallbackAtivo = true;
    }

    if (fallbackAtivo) {
      status_ia = 'PENDENTE_ANALISE';
      resultado_ia = 'FALHA DE PROCESSAMENTO IA';
      confianca_ia = 0.0;
      justificativa_ia = "Aviso: O serviço de análise de IA está indisponível ou falhou. Esta evidência foi direcionada para REVISÃO MANUAL obrigatória pelo CQ. Por favor, tome a decisão manualmente.";
      ia_modelo = "AI Offline Fallback";
      ia_custo_estimado = 0.0;
    }

    const nowStr = new Date().toISOString();
    const confidenceScore = Math.round(confianca_ia * 100);
    const riscoLgpdVal = risco_lgpd === 'ALTO' ? 1 : 0;

    // 8. Salvar resposta da IA no D1
    await env.DB.prepare(`
      UPDATE ia_evidencias
      SET status_ia = ?,
          resultado_ia = ?,
          confianca_ia = ?,
          confidence_score = ?,
          justificativa_ia = ?,
          ia_analisado_em = ?,
          ia_modelo = ?,
          ia_custo_estimado = ?,
          ia_origem = 'MANUAL',
          ia_hash_arquivo = ?,
          risco_lgpd = ?,
          risco_lgpd_tipos_json = ?,
          protected_preview_r2_key = ?,
          preview_protegido_gerado = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      status_ia,
      resultado_ia,
      confianca_ia,
      confidenceScore,
      justificativa_ia,
      nowStr,
      ia_modelo,
      ia_custo_estimado,
      ia_hash_arquivo,
      riscoLgpdVal,
      risco_lgpd_tipos_json,
      protected_preview_r2_key,
      preview_protegido_gerado,
      evidencia_id
    ).run();

    // Also update standard `evidencias` table if it exists
    try {
      await env.DB.prepare(`
        UPDATE evidencias
        SET status = ?,
            risco_lgpd = ?,
            risco_lgpd_tipos_json = ?,
            protected_preview_r2_key = ?,
            preview_protegido_gerado = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE image_hash = ? AND (avaliacao_id = ? OR portal_id IN (SELECT id FROM portais_evidencias WHERE avaliacao_id = ?))
      `).bind(
        resultado_ia,
        riscoLgpdVal,
        risco_lgpd_tipos_json,
        protected_preview_r2_key,
        preview_protegido_gerado,
        ia_hash_arquivo,
        evidence.certificacao_id,
        evidence.certificacao_id
      ).run();
    } catch (mirrorErr) {
      console.warn("Could not update standard evidencias table mirror:", mirrorErr);
    }

    // 8b. Gravar histórico detalhado de decisões da IA (ia_decision_history)
    const historyId = crypto.randomUUID();
    const processTime = Date.now() - startTime;
    try {
      await env.DB.prepare(`
        INSERT INTO ia_decision_history (
          id, imagem_hash, modelo, versao_prompt, confidence, resultado,
          tempo_processamento, usuario, certificacao, checklist,
          cq_confirmou, cq_corrigiu, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
      `).bind(
        historyId,
        ia_hash_arquivo || '',
        ia_modelo || 'Nenhum',
        config.ENABLE_EVIDENCE_AI && env.GEMINI_API_KEY ? "2.0.0-gemini" : "1.2.0-knowledge",
        confidenceScore,
        resultado_ia || 'FALHA DE PROCESSAMENTO IA',
        processTime,
        finalUserId,
        certNome || 'GPON Veterano',
        evidence.etapa,
        nowStr
      ).run();
    } catch (historyErr) {
      console.error("Erro ao gravar histórico em ia_decision_history:", historyErr);
    }

    // 9. Log auditoria de análise realizada
    await logEvent(env, {
      tipo: fallbackAtivo ? LogLevel.ERROR : LogLevel.INFO,
      evento: fallbackAtivo ? `Falha de processamento na análise manual por IA` : `Análise manual por IA concluída`,
      usuario_id: finalUserId,
      perfil: finalPerfil,
      ip: clientIp,
      userAgent,
      metadata: {
        etapa: evidence.etapa,
        modelo: ia_modelo,
        custo: ia_custo_estimado,
        origem: 'MANUAL',
        regras_usadas: ruleIdsUsed,
        confidence_score: confidenceScore,
        risco_lgpd: risco_lgpd,
        erro: fallbackAtivo ? "Serviço AI indisponível ou falhou" : undefined
      }
    });

    // Buscar registro updated
    const updatedRecord = await env.DB.prepare("SELECT * FROM ia_evidencias WHERE id = ?").bind(evidencia_id).first() as any;

    return jsonResponse({
      success: true,
      reused: false,
      evidence: {
        ...updatedRecord,
        confidence_score: confidenceScore // make sure it's returned on the object
      }
    });

  } catch (err: any) {
    console.error("Analisar IA Error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro interno ao executar análise da IA." }, 500);
  }
};
