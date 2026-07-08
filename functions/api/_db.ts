import { runInitialMigration } from './migrations/0001_initial_schema';
import { Logger } from './_logger';

export interface Env {
  DB: D1Database;
  RealtimeHub: any;
  EVIDENCIAS_BUCKET?: any;
  BUCKET?: any;
  R2?: any;
  AI?: any;
  MAX_ANALISES_IA_DIA?: string | number;
  MAX_ANALISES_IA_MES?: string | number;
  ia_modo_automatico_gratis?: string | number | boolean;
  ia_exigir_confirmacao_quando_pago?: string | number | boolean;
  ia_limite_gratuito_diario?: string | number;
  ia_limite_gratuito_mensal?: string | number;
  LGPD_HASH_SALT?: string;
}

let dbInitialized = false;

export async function initDb(db: D1Database): Promise<void> {
  if (dbInitialized) {
    return;
  }

  try {
    await runInitialMigration(db);
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
