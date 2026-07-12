import { runInitialMigration } from './migrations/0001_initial_schema';
import { runIncrementalMigration } from './migrations/0002_add_mission_config_columns';
import { runRetentionMigration } from './migrations/0003_add_retention_columns';
import { runOperationalSupportMigration } from './migrations/0004_add_operational_support_tables';
import { runConsolidatedFieldsMigration } from './migrations/0005_add_consolidated_fields';
import { Logger } from './_logger';

export interface Env {
  DB: D1Database;
  RealtimeHub: any;
  EVIDENCIAS_BUCKET?: any;
  BUCKET?: any;
  R2?: any;
  AI?: any;
  CLARO_KV?: any;
  MAX_ANALISES_IA_DIA?: string | number;
  MAX_ANALISES_IA_MES?: string | number;
  MAX_ANALISES_IA_POR_USUARIO_DIA?: string | number;
  ia_modo_automatico_gratis?: string | number | boolean;
  ia_exigir_confirmacao_quando_pago?: string | number | boolean;
  ia_limite_gratuito_diario?: string | number;
  ia_limite_gratuito_mensal?: string | number;
  LGPD_HASH_SALT?: string;
  IMAGE_SIGNING_SECRET?: string;
  ENABLE_WORKERS_AI?: string | boolean;
  ENABLE_AI_AUTO_ANALYSIS?: string | boolean;
  ENABLE_AI_MANUAL_TRIGGER?: string | boolean;
  ENABLE_CLOUDFLARE_QUEUES?: string | boolean;
  ENABLE_DURABLE_OBJECTS?: string | boolean;
  ENABLE_REALTIME?: string | boolean;
  ENABLE_AUTH?: string | boolean;
  ENABLE_KV_CACHE?: string | boolean;
  ENABLE_EDGE_CACHE?: string | boolean;
  ENABLE_OBSERVABILITY_BASIC?: string | boolean;
  ENABLE_OBSERVABILITY_ADVANCED?: string | boolean;
  ENABLE_KNOWLEDGE_BASE?: string | boolean;
  ENABLE_AI_FEEDBACK?: string | boolean;
  ENABLE_AI_DASHBOARD?: string | boolean;
  ENABLE_COST_DASHBOARD?: string | boolean;
  ENABLE_CONFIDENCE_SCORE?: string | boolean;
  ENABLE_EVIDENCE_PORTAL?: string | boolean;
  ENABLE_EVIDENCE_AI?: string | boolean;
  ENABLE_CONSOLIDATED_AI_ANALYSIS?: string | boolean;
  ENABLE_PARTIAL_AI_REANALYSIS?: string | boolean;
  ENABLE_AI_RESULT_REUSE?: string | boolean;
  ENABLE_AI_COST_CONFIRMATION?: string | boolean;
  ENABLE_LGPD_RISK_SCAN?: string | boolean;
  ENABLE_PROTECTED_PREVIEW?: string | boolean;
  ENABLE_FACE_CONSISTENCY_CHECK?: string | boolean;
  ENABLE_EVIDENCE_THUMBNAILS?: string | boolean;
  ENABLE_EVIDENCE_RETENTION?: string | boolean;
  RETENCAO_EVIDENCIAS_DIAS?: string | number;
  RETENCAO_LOGS_DIAS?: string | number;
  GEMINI_API_KEY?: string;
}

let dbInitialized = false;

export async function initDb(db: D1Database): Promise<void> {
  if (dbInitialized) {
    return;
  }

  try {
    await runInitialMigration(db);
    await runIncrementalMigration(db);
    await runRetentionMigration(db);
    await runOperationalSupportMigration(db);
    await runConsolidatedFieldsMigration(db);

    // Ensure new tables are created for evolution
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        tipo_certificacao TEXT,
        categoria TEXT,
        checklist_item TEXT,
        titulo TEXT NOT NULL,
        descricao TEXT,
        regra TEXT,
        prioridade INTEGER DEFAULT 1,
        ativo INTEGER DEFAULT 1,
        criado_por TEXT,
        atualizado_por TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS knowledge_versions (
        id TEXT PRIMARY KEY,
        knowledge_id TEXT NOT NULL,
        versao INTEGER NOT NULL,
        alteracao TEXT,
        usuario TEXT,
        created_at TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ia_decision_history (
        id TEXT PRIMARY KEY,
        imagem_hash TEXT,
        modelo TEXT,
        versao_prompt TEXT,
        confidence REAL,
        resultado TEXT,
        tempo_processamento INTEGER,
        usuario TEXT,
        certificacao TEXT,
        checklist TEXT,
        cq_confirmou INTEGER DEFAULT 0,
        cq_corrigiu INTEGER DEFAULT 0,
        motivo_correcao TEXT,
        created_at TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ia_sugestoes_admin (
        id TEXT PRIMARY KEY,
        checklist_item TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        status TEXT DEFAULT 'PENDENTE',
        created_at TEXT
      )
    `).run();

    // Safely add confidence_score column to ia_evidencias if it doesn't exist
    try {
      await db.prepare("ALTER TABLE ia_evidencias ADD COLUMN confidence_score INTEGER DEFAULT NULL").run();
    } catch (e) {
      // Column already exists, ignore
    }

    // Safely add image_signature column to ia_evidencias if it doesn't exist (using PRAGMA table_info verification)
    try {
      const info = await db.prepare("PRAGMA table_info(ia_evidencias)").all() as { results: any[] };
      const hasImgSig = info.results && info.results.some((col: any) => col.name === 'image_signature');
      if (!hasImgSig) {
        await db.prepare("ALTER TABLE ia_evidencias ADD COLUMN image_signature TEXT").run();
        Logger.info("Coluna 'image_signature' adicionada com sucesso à tabela ia_evidencias.");
      } else {
        Logger.info("Coluna 'image_signature' já existe na tabela ia_evidencias.");
      }
    } catch (err: any) {
      Logger.error(`Erro ao verificar/adicionar coluna image_signature: ${err.message || err}`);
    }

    // Seed initial knowledge base rules if empty
    try {
      const countCheck = await db.prepare("SELECT COUNT(*) as cnt FROM knowledge_base").first() as any;
      if (countCheck && countCheck.cnt === 0) {
        const now = new Date().toISOString();
        const seedRules = [
          {
            id: 'kb_seed_1',
            tipo_certificacao: 'GPON Veterano',
            categoria: 'Instalação Física',
            checklist_item: 'Evidência da instalação física',
            titulo: 'Botão Escada obrigatório',
            descricao: 'Uso correto do cinto de segurança e ativação do Botão Escada no aplicativo de campo.',
            regra: 'A foto deve exibir de forma inequívoca o travamento da escada no poste e a fita de amarração perfeitamente tensionada.',
            prioridade: 5,
            ativo: 1,
            criado_por: 'sistema',
            atualizado_por: 'sistema',
            created_at: now,
            updated_at: now
          },
          {
            id: 'kb_seed_2',
            tipo_certificacao: 'HFC Capacitação',
            categoria: 'Instalação Física',
            checklist_item: 'Evidência dos níveis de sinal',
            titulo: 'Conector F obrigatório',
            descricao: 'Todos os cabos coaxiais devem ser conectorizados exclusivamente com conectores do tipo F de compressão.',
            regra: 'A imagem deve exibir o conector F completamente inserido na porta do tap ou splitter, com o torque adequado de 30 in-lbs aplicado (sem folgas na rosca).',
            prioridade: 4,
            ativo: 1,
            criado_por: 'sistema',
            atualizado_por: 'sistema',
            created_at: now,
            updated_at: now
          },
          {
            id: 'kb_seed_3',
            tipo_certificacao: 'GPON Capacitação',
            categoria: 'Banda Larga',
            checklist_item: 'Evidência da ONT/equipamento',
            titulo: 'Fibra Invisível quando aplicável',
            descricao: 'Sempre oferecer fibra invisível no acabamento interno para minimizar impacto visual no cliente.',
            regra: 'Verificar se o cabo óptico invisível segue as quinas de paredes, de maneira discreta, fixado com cola quente ou fita apropriada de forma invisível.',
            prioridade: 3,
            ativo: 1,
            criado_por: 'sistema',
            atualizado_por: 'sistema',
            created_at: now,
            updated_at: now
          }
        ];

        for (const rule of seedRules) {
          await db.prepare(`
            INSERT INTO knowledge_base (
              id, tipo_certificacao, categoria, checklist_item, titulo, descricao, regra, prioridade, ativo, criado_por, atualizado_por, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            rule.id,
            rule.tipo_certificacao,
            rule.categoria,
            rule.checklist_item,
            rule.titulo,
            rule.descricao,
            rule.regra,
            rule.prioridade,
            rule.ativo,
            rule.criado_por,
            rule.atualizado_por,
            rule.created_at,
            rule.updated_at
          ).run();

          // Also add to knowledge_versions
          await db.prepare(`
            INSERT INTO knowledge_versions (
              id, knowledge_id, versao, alteracao, usuario, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            crypto.randomUUID(),
            rule.id,
            1,
            'Criação inicial de regra padrão',
            'sistema',
            now
          ).run();
        }
      }
    } catch (err) {
      console.error("Error seeding knowledge_base:", err);
    }

    // Portal de Evidências Antecipadas Tables Creation
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ia_lgpd_aceite (
        id TEXT PRIMARY KEY,
        avaliacao_id TEXT NOT NULL,
        tecnico_login_hash TEXT NOT NULL,
        aceite_lgpd INTEGER DEFAULT 1,
        aceite_lgpd_em TEXT NOT NULL,
        versao_termo TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS portal_lgpd_aceites (
        id TEXT PRIMARY KEY,
        avaliacao_id TEXT NOT NULL,
        tecnico_login_hash TEXT NOT NULL,
        versao_termo TEXT NOT NULL,
        aceite_em TEXT NOT NULL,
        documento_visualizado INTEGER DEFAULT 0,
        documento_baixado INTEGER DEFAULT 0
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS portais_evidencias (
        id TEXT PRIMARY KEY,
        avaliacao_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        liberado_em TEXT,
        expira_em TEXT,
        encerrado_em TEXT,
        encerrado_motivo TEXT,
        reaberto_em TEXT,
        reaberto_por TEXT,
        ultimo_acesso_em TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS missoes_evidencias (
        id TEXT PRIMARY KEY,
        certificacao_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        orientacao_foto TEXT,
        grupo_evidencia TEXT,
        quantidade_minima INTEGER DEFAULT 1,
        quantidade_maxima INTEGER DEFAULT 1,
        obrigatoria INTEGER DEFAULT 1,
        ordem INTEGER NOT NULL,
        ativa INTEGER DEFAULT 1,
        permite_camera INTEGER DEFAULT 1,
        permite_galeria INTEGER DEFAULT 1,
        prompt_ia_especifico TEXT,
        created_by TEXT,
        updated_by TEXT,
        exemplo_correto_r2_key TEXT,
        exemplo_incorreto_r2_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS missao_evidencia_itens (
        missao_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        tipo_validacao TEXT DEFAULT 'IA_VISION',
        peso_ia REAL DEFAULT 1.0,
        confirmacao_cq_obrigatoria INTEGER DEFAULT 1,
        ativo INTEGER DEFAULT 1,
        PRIMARY KEY (missao_id, item_id)
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS evidencias (
        id TEXT PRIMARY KEY,
        portal_id TEXT NOT NULL,
        avaliacao_id TEXT NOT NULL,
        missao_id TEXT NOT NULL,
        tecnico_login_hash TEXT,
        r2_key TEXT NOT NULL,
        image_hash TEXT NOT NULL,
        image_signature TEXT,
        mime_type TEXT,
        tamanho_original INTEGER,
        tamanho_final INTEGER,
        largura INTEGER,
        altura INTEGER,
        status TEXT NOT NULL,
        repetida INTEGER DEFAULT 0,
        repetida_avaliacao_id TEXT,
        enviada_em TEXT NOT NULL,
        retencao_ate TEXT,
        arquivo_excluido INTEGER DEFAULT 0,
        arquivo_excluido_em TEXT,
        arquivo_exclusao_motivo TEXT,
        r2_deleted INTEGER DEFAULT 0,
        thumbnail_deleted INTEGER DEFAULT 0,
        thumbnail_r2_key TEXT,
        protected_preview_r2_key TEXT,
        risco_lgpd INTEGER DEFAULT 0,
        risco_lgpd_tipos_json TEXT,
        preview_protegido_gerado INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    // Create Indexes for Evidence Portal
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_portais_avaliacao ON portais_evidencias(avaliacao_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_portais_token ON portais_evidencias(token_hash)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_portais_status ON portais_evidencias(status)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_evidencias_hash ON evidencias(image_hash)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_evidencias_portal ON evidencias(portal_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_evidencias_missao ON evidencias(missao_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_missoes_cert ON missoes_evidencias(certificacao_id)").run();

    // Seed default missions and item mapping if empty
    try {
      const missionsCheck = await db.prepare("SELECT COUNT(*) as cnt FROM missoes_evidencias").first() as any;
      if (missionsCheck && missionsCheck.cnt === 0) {
        Logger.info("Seeding default Evidence Missions and mapping items...");
        const now = new Date().toISOString();

        // Let's retrieve existing certifications and items
        const certsRows = await db.prepare("SELECT id, nome FROM certificacoes").all();
        const certs = certsRows.results || [];

        const itemsRows = await db.prepare("SELECT id, certificacao_id, descricao FROM itens").all();
        const items = itemsRows.results || [];

        for (const cert of certs) {
          const certId = cert.id;

          // Standard missions we will create:
          const defaultMissions = [
            {
              id: `missao_ident_${certId}`,
              nome: "Identificação do Técnico",
              descricao: "Apresentação e identificação com crachá e veículo da empresa",
              orientacao: "Tire uma foto nítida do seu crachá de identificação funcional posicionado ao lado do veículo da Claro ou crachá em primeiro plano.",
              grupo: "Processos",
              ordem: 1,
              obrigatoria: 1,
              keywords: ["se apresentou", "status no pda", "identificou", "identificação"]
            },
            {
              id: `missao_seg_${certId}`,
              nome: "Segurança de Altura & Poste",
              descricao: "Garantia de ancoragem de escada e cintagem corretas",
              orientacao: "Tire uma foto da escada devidamente travada e amarrada ao poste, mostrando o cinto/talabarte de segurança conectado à linha de vida ou corda de amarração.",
              grupo: "Instalação Física",
              ordem: 2,
              obrigatoria: 1,
              keywords: ["cintagem", "cinto", "botão escada", "apr", "altura"]
            },
            {
              id: `missao_con_${certId}`,
              nome: "Conectorização Técnica",
              descricao: "Evidência em macrofoco da montagem dos conectores",
              orientacao: "Tire uma foto nítida e bem próxima (macrofoco) do conector finalizado (óptico mecânico ou coaxial de compressão) na NAP, MDU ou splitter.",
              grupo: "Instalação Física",
              ordem: 3,
              obrigatoria: 1,
              keywords: ["conector", "conectores", "confecção"]
            },
            {
              id: `missao_sin_${certId}`,
              nome: "Níveis de Sinal & Medição",
              descricao: "Exibição dos níveis medidos no equipamento/instrumento",
              orientacao: "Tire uma foto da tela do seu Power Meter (para GPON) ou do Field/Sinal (para HFC) ou do aplicativo de medição mostrando os níveis adequados.",
              grupo: "Sinal & Rede",
              ordem: 4,
              obrigatoria: 1,
              keywords: ["medição de sinal", "sinal", "tx", "rx", "snr", "power meter"]
            },
            {
              id: `missao_org_${certId}`,
              nome: "Organização & Acabamento Interno",
              descricao: "Acomodação dos cabos e fixação do equipamento",
              orientacao: "Tire uma foto que mostre o posicionamento final da ONT, decoder ou eMTA, bem como o acabamento do cabo (cabo invisível, fixação na parede e acomodação limpa).",
              grupo: "Instalação Física",
              ordem: 5,
              obrigatoria: 1,
              keywords: ["acabamento", "organização", "passagem", "acomodação", "pto", "ont", "furo", "fita"]
            }
          ];

          for (const m of defaultMissions) {
            // Insert mission
            await db.prepare(`
              INSERT INTO missoes_evidencias (id, certificacao_id, nome, descricao, orientacao_foto, grupo_evidencia, quantidade_minima, quantidade_maxima, obrigatoria, ordem, ativa, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1, ?, ?)
            `).bind(m.id, certId, m.nome, m.descricao, m.orientacao, m.grupo, m.obrigatoria, m.ordem, now, now).run();

            // Find matching checklist items by keywords to map to this mission
            const matchedItems = items.filter((item: any) => {
              if (Number(item.certificacao_id) !== Number(certId)) return false;
              const descLower = String(item.descricao).toLowerCase();
              return m.keywords.some(kw => descLower.includes(kw));
            });

            for (const item of matchedItems) {
              await db.prepare(`
                INSERT INTO missao_evidencia_itens (missao_id, item_id, tipo_validacao, peso_ia, confirmacao_cq_obrigatoria, ativo)
                VALUES (?, ?, 'IA_VISION', 1.0, 1, 1)
              `).bind(m.id, item.id).run();
            }
          }
        }
      }
    } catch (errSeed) {
      console.error("Error seeding Evidence Portal default data:", errSeed);
    }

    dbInitialized = true;
  } catch (error) {
    Logger.error("Falha fatal ao inicializar banco de dados D1:", error);
    throw error;
  }
}

export function jsonResponse(data: any, status: number = 200): Response {
  // Always include standard headers to prevent caching of dynamic API results
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}
