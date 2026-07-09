import { runInitialMigration } from './migrations/0001_initial_schema';
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
  RETENCAO_EVIDENCIAS_DIAS?: string | number;
  RETENCAO_LOGS_DIAS?: string | number;
}

let dbInitialized = false;

export async function initDb(db: D1Database): Promise<void> {
  if (dbInitialized) {
    return;
  }

  try {
    await runInitialMigration(db);

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
