import { initDb, Env, jsonResponse } from '../../_db';
import { logEvent, LogLevel } from '../../_logger';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    const { action, token, avaliacaoId, sessionHash } = data;
    
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "";
    
    const nowStr = new Date().toISOString();
    
    if (avaliacaoId) {
      // Fetch the evaluation matricula to compute login hash if possible
      const avaliacao = await env.DB.prepare(
        "SELECT matricula FROM avaliacoes WHERE id = ?"
      ).bind(avaliacaoId).first() as any;
      
      let tecnico_login_hash = "anonymized";
      if (avaliacao && avaliacao.matricula) {
        const salt = env.LGPD_HASH_SALT || "default_salt";
        const matchMatricula = String(avaliacao.matricula).trim().toUpperCase();
        const input = `${matchMatricula}:${salt}`;
        const enc = new TextEncoder();
        const hashData = enc.encode(input);
        const hashBuf = await crypto.subtle.digest('SHA-256', hashData);
        const hashArr = Array.from(new Uint8Array(hashBuf));
        tecnico_login_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      
      // Check if record already exists
      const existing = await env.DB.prepare(
        "SELECT id, documento_visualizado, documento_baixado FROM portal_lgpd_aceites WHERE avaliacao_id = ?"
      ).bind(avaliacaoId).first() as any;
      
      if (existing) {
        if (action === 'visualizar') {
          await env.DB.prepare(
            "UPDATE portal_lgpd_aceites SET documento_visualizado = documento_visualizado + 1 WHERE id = ?"
          ).bind(existing.id).run();
        } else if (action === 'baixar') {
          await env.DB.prepare(
            "UPDATE portal_lgpd_aceites SET documento_baixado = documento_baixado + 1 WHERE id = ?"
          ).bind(existing.id).run();
        }
      } else {
        const id = crypto.randomUUID();
        const vis = action === 'visualizar' ? 1 : 0;
        const dw = action === 'baixar' ? 1 : 0;
        await env.DB.prepare(`
          INSERT INTO portal_lgpd_aceites (id, avaliacao_id, tecnico_login_hash, versao_termo, aceite_em, documento_visualizado, documento_baixado)
          VALUES (?, ?, ?, 'v1', ?, ?, ?)
        `).bind(id, avaliacaoId, tecnico_login_hash, nowStr, vis, dw).run();
      }
    }
    
    // Log event in audit log
    const auditEvent = action === 'visualizar' ? "DOCUMENTO_PRIVACIDADE_VISUALIZADO" : "DOCUMENTO_PRIVACIDADE_BAIXADO";
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: auditEvent,
      usuario_id: "tecnico",
      perfil: "tecnico",
      ip: clientIp,
      userAgent,
      metadata: {
        avaliacao_id: avaliacaoId || null,
        portal_token: token || null
      }
    });
    
    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Privacy logging API error:", err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
};
