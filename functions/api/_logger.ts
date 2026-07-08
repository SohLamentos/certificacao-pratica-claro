import { Env } from './_db';
import { getAppConfig } from './_config';

export enum LogLevel {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  AUDITORIA = "AUDITORIA",
  IA = "IA",
  UPLOAD = "UPLOAD",
  LOGIN = "LOGIN"
}

export async function hashWithSalt(text: string, salt: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    // Quick fallback hash if crypto fails
    let hash = 0;
    const combined = text + salt;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'fallback_' + Math.abs(hash).toString(16);
  }
}

export async function logEvent(
  env: Env,
  params: {
    tipo: LogLevel;
    evento: string;
    usuario_id?: string;
    perfil?: string;
    ip?: string;
    userAgent?: string;
    metadata?: any;
  }
) {
  const timestamp = new Date().toISOString();
  const consoleMsg = `[${timestamp}] [${params.tipo}] ${params.evento} - Metadata: ${JSON.stringify(params.metadata || {})}`;
  
  if (params.tipo === LogLevel.ERROR) {
    console.error(consoleMsg);
  } else if (params.tipo === LogLevel.WARNING) {
    console.warn(consoleMsg);
  } else {
    console.info(consoleMsg);
  }

  try {
    const config = getAppConfig(env);
    
    // Only log if basic observability is enabled
    if (!config.ENABLE_OBSERVABILITY_BASIC) {
      return;
    }

    const salt = config.LGPD_HASH_SALT;
    let ip_hash = null;
    if (params.ip) {
      ip_hash = await hashWithSalt(params.ip, salt);
    }
    
    let user_agent_hash = null;
    if (params.userAgent) {
      user_agent_hash = await hashWithSalt(params.userAgent, salt);
    }

    const metadata_json = params.metadata ? JSON.stringify(params.metadata) : null;

    if (env.DB) {
      await env.DB.prepare(
        "INSERT INTO app_logs (tipo, evento, usuario_id, perfil, ip_hash, user_agent_hash, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        params.tipo,
        params.evento,
        params.usuario_id || null,
        params.perfil || null,
        ip_hash,
        user_agent_hash,
        metadata_json
      ).run();
    }
  } catch (err) {
    console.error("Erro ao registrar log no D1:", err);
  }
}

export class Logger {
  static log(level: LogLevel, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const logObj = {
      timestamp,
      level,
      message,
      ...(meta ? { meta } : {})
    };

    const logStr = JSON.stringify(logObj);
    if (level === LogLevel.ERROR) {
      console.error(logStr);
    } else if (level === LogLevel.WARNING) {
      console.warn(logStr);
    } else {
      console.info(logStr);
    }
  }

  static info(message: string, meta?: any) {
    this.log(LogLevel.INFO, message, meta);
  }

  static warn(message: string, meta?: any) {
    this.log(LogLevel.WARNING, message, meta);
  }

  static error(message: string, meta?: any) {
    this.log(LogLevel.ERROR, message, meta);
  }

  static auditoria(message: string, meta?: any) {
    this.log(LogLevel.AUDITORIA, message, meta);
  }
}
