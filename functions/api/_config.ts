import { Env } from './_db';

export function getFeatureFlag(env: Env, flagName: keyof Env, defaultValue: boolean): boolean {
  const val = env[flagName];
  if (val === undefined || val === null) {
    return defaultValue;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  const strVal = String(val).toLowerCase().trim();
  return strVal === 'true' || strVal === '1';
}

export function getNumericEnv(env: Env, varName: keyof Env, defaultValue: number): number {
  const val = env[varName];
  if (val === undefined || val === null) {
    return defaultValue;
  }
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

export function getAppConfig(env: Env) {
  return {
    // 1. Feature Flags
    ENABLE_WORKERS_AI: getFeatureFlag(env, 'ENABLE_WORKERS_AI', true),
    ENABLE_AI_AUTO_ANALYSIS: getFeatureFlag(env, 'ENABLE_AI_AUTO_ANALYSIS', false), // DEFAULT TO FALSE FOR MINIMUM COST
    ENABLE_AI_MANUAL_TRIGGER: getFeatureFlag(env, 'ENABLE_AI_MANUAL_TRIGGER', true),
    ENABLE_CLOUDFLARE_QUEUES: getFeatureFlag(env, 'ENABLE_CLOUDFLARE_QUEUES', false),
    ENABLE_DURABLE_OBJECTS: getFeatureFlag(env, 'ENABLE_DURABLE_OBJECTS', false),
    ENABLE_REALTIME: getFeatureFlag(env, 'ENABLE_REALTIME', false), // DEFAULT TO FALSE FOR MINIMUM COST
    ENABLE_KV_CACHE: getFeatureFlag(env, 'ENABLE_KV_CACHE', false),
    ENABLE_EDGE_CACHE: getFeatureFlag(env, 'ENABLE_EDGE_CACHE', false),
    ENABLE_OBSERVABILITY_BASIC: getFeatureFlag(env, 'ENABLE_OBSERVABILITY_BASIC', true),
    ENABLE_OBSERVABILITY_ADVANCED: getFeatureFlag(env, 'ENABLE_OBSERVABILITY_ADVANCED', false),
    ENABLE_KNOWLEDGE_BASE: getFeatureFlag(env, 'ENABLE_KNOWLEDGE_BASE', true),
    ENABLE_AI_FEEDBACK: getFeatureFlag(env, 'ENABLE_AI_FEEDBACK', true),
    ENABLE_AI_DASHBOARD: getFeatureFlag(env, 'ENABLE_AI_DASHBOARD', true),
    ENABLE_COST_DASHBOARD: getFeatureFlag(env, 'ENABLE_COST_DASHBOARD', true),
    ENABLE_CONFIDENCE_SCORE: getFeatureFlag(env, 'ENABLE_CONFIDENCE_SCORE', true),

    // New requested feature flags (Requirement 25)
    ENABLE_EVIDENCE_PORTAL: getFeatureFlag(env, 'ENABLE_EVIDENCE_PORTAL', true),
    ENABLE_EVIDENCE_AI: getFeatureFlag(env, 'ENABLE_EVIDENCE_AI', false),
    ENABLE_LGPD_RISK_SCAN: getFeatureFlag(env, 'ENABLE_LGPD_RISK_SCAN', false),
    ENABLE_PROTECTED_PREVIEW: getFeatureFlag(env, 'ENABLE_PROTECTED_PREVIEW', false),
    ENABLE_FACE_CONSISTENCY_CHECK: getFeatureFlag(env, 'ENABLE_FACE_CONSISTENCY_CHECK', false),
    ENABLE_EVIDENCE_THUMBNAILS: getFeatureFlag(env, 'ENABLE_EVIDENCE_THUMBNAILS', true),
    ENABLE_EVIDENCE_RETENTION: getFeatureFlag(env, 'ENABLE_EVIDENCE_RETENTION', true),

    // Limits
    MAX_ANALISES_IA_DIA: getNumericEnv(env, 'MAX_ANALISES_IA_DIA', 50),
    MAX_ANALISES_IA_MES: getNumericEnv(env, 'MAX_ANALISES_IA_MES', 1000),
    MAX_ANALISES_IA_POR_USUARIO_DIA: getNumericEnv(env, 'MAX_ANALISES_IA_POR_USUARIO_DIA', 10),

    // Secrets
    IMAGE_SIGNING_SECRET: env.IMAGE_SIGNING_SECRET,
    LGPD_HASH_SALT: env.LGPD_HASH_SALT,
    RETENCAO_EVIDENCIAS_DIAS: getNumericEnv(env, 'RETENCAO_EVIDENCIAS_DIAS', 30), // Default to 30 days
    RETENCAO_LOGS_DIAS: getNumericEnv(env, 'RETENCAO_LOGS_DIAS', 90),
  };
}
