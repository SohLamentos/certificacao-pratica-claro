import { Env } from '../_db';
import { logEvent, LogLevel } from '../_logger';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";

  try {
    const data = await request.json() as any;
    const { profile, userId, userName } = data;

    if (!profile || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Parâmetros inválidos",
        message: "Os parâmetros 'profile' e 'userId' são obrigatórios.",
        data: null
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!env.LGPD_HASH_SALT) {
      return new Response(JSON.stringify({
        success: false,
        error: "Configuração Ausente",
        message: "Erro de Configuração: A chave LGPD_HASH_SALT não foi configurada no ambiente.",
        data: null
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const salt = env.LGPD_HASH_SALT;
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 horas de sessão

    const payload = {
      userId,
      profile,
      userName: userName || "Usuário",
      exp: expiresAt
    };

    const encoder = new TextEncoder();
    const payloadStr = JSON.stringify(payload);
    const encodedPayload = btoa(unescape(encodeURIComponent(payloadStr)));

    const keyData = encoder.encode(salt);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(encodedPayload)
    );

    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const token = `${encodedPayload}.${signatureHex}`;

    await logEvent(env, {
      tipo: LogLevel.LOGIN,
      evento: `Sessão iniciada com sucesso para o usuário ${userId} (${profile})`,
      usuario_id: userId,
      perfil: profile,
      ip: clientIp,
      userAgent: userAgent,
      metadata: { userName }
    });

    return new Response(JSON.stringify({
      success: true,
      error: null,
      message: "Autenticação realizada com sucesso.",
      data: {
        token,
        profile,
        expiresAt,
        user: {
          id: userId,
          nome: userName || "Usuário"
        }
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    await logEvent(env, {
      tipo: LogLevel.ERROR,
      evento: "Erro no endpoint de login",
      ip: clientIp,
      userAgent: userAgent,
      metadata: { error: err.message || String(err) }
    });

    return new Response(JSON.stringify({
      success: false,
      error: "Erro de Autenticação",
      message: "Não foi possível gerar a sessão segura.",
      data: null
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
