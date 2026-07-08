import { Env } from '../_db';
import { Logger } from '../_logger';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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

    const salt = env.LGPD_HASH_SALT || "claro_cq_lgpd_salt_2026_prod";
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

    Logger.info(`Sessão iniciada com sucesso para o usuário ${userId} (${profile})`);

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
    Logger.error("Erro no endpoint de login", err);
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
