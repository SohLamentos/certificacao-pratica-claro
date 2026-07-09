import { Env, initDb, jsonResponse } from './_db';
import { AuthService } from './_services';
import { Logger } from './_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";

  // Ensure D1 database is initialized
  try {
    await initDb(env.DB);
  } catch (err) {
    Logger.error("Falha fatal ao inicializar banco de dados D1", err);
  }

  // 1. Public Authentication Route Bypass with Rate Limiting (20/min per IP)
  if (url.pathname.startsWith('/api/auth/login') || (url.pathname.startsWith('/api/cqs') && request.method === 'GET')) {
    if (url.pathname.startsWith('/api/auth/login')) {
      try {
        const { applyRateLimit } = await import('./_ratelimit');
        const rateLimitResult = await applyRateLimit(env, 'login', clientIp);
        if (!rateLimitResult.allowed) {
          return jsonResponse({
            success: false,
            error: "Muitas solicitações",
            message: "Limite de tentativas de login excedido. Tente novamente em 1 minuto."
          }, 429);
        }
      } catch (e) {
        Logger.error("Erro na validação de rate limit no login", e);
      }
    }
    const response = await context.next();
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return jsonResponse({
        success: false,
        error: "Rota não encontrada",
        message: `A rota pública '${url.pathname}' não foi encontrada no servidor.`,
        data: null
      }, 404);
    }
    return response;
  }

  // 2. Serve static/uploaded files with valid session
  // (Always validate token for file downloads too, as demanded: "Todas as rotas devem validar autenticação")
  
  try {
    // Validate request headers
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      Logger.warn(`Acesso negado: Cabeçalho Authorization ausente para ${url.pathname}`);
      return jsonResponse({
        success: false,
        error: "Não autorizado",
        message: "Cabeçalho de autenticação ausente ou inválido.",
        data: null
      }, 401);
    }

    const token = authHeader.substring(7);
    if (!env.LGPD_HASH_SALT) {
      Logger.error(`Acesso negado: LGPD_HASH_SALT não configurado no ambiente para ${url.pathname}`);
      return jsonResponse({
        success: false,
        error: "Erro de Configuração",
        message: "Erro de Configuração: A chave LGPD_HASH_SALT não foi configurada no ambiente.",
        data: null
      }, 500);
    }
    const salt = env.LGPD_HASH_SALT;
    const userPayload = await AuthService.verifyToken(token, salt);

    if (!userPayload) {
      Logger.warn(`Acesso negado: Token inválido ou sessão expirada para ${url.pathname}`);
      return jsonResponse({
        success: false,
        error: "Sessão expirada",
        message: "Sua sessão segura expirou ou é inválida. Por favor, faça login novamente.",
        data: null
      }, 401);
    }

    // Apply General API Rate Limiting (100/min per user or IP)
    try {
      const { applyRateLimit } = await import('./_ratelimit');
      const rateLimitResult = await applyRateLimit(env, 'general', userPayload.id || clientIp);
      if (!rateLimitResult.allowed) {
        return jsonResponse({
          success: false,
          error: "Muitas solicitações",
          message: "Limite de requisições excedido. Tente novamente em 1 minuto."
        }, 429);
      }
    } catch (e) {
      Logger.error("Erro na validação de rate limit geral", e);
    }

    // Role-based authorization controls
    if (request.method !== 'GET') {
      const allowedProfiles = ['cq', 'analista', 'tecnico'];
      if (!allowedProfiles.includes(userPayload.profile)) {
        Logger.warn(`Acesso proibido: Perfil '${userPayload.profile}' não autorizado para escrita em ${url.pathname}`);
        return jsonResponse({
          success: false,
          error: "Acesso proibido",
          message: "Seu perfil de usuário não possui permissão para realizar esta ação.",
          data: null
        }, 403);
      }
    }

    // Propagate session context down to route controllers safely
    (context as any).data = (context as any).data || {};
    (context as any).data.user = userPayload;

    // Execute downstream handlers
    const response = await context.next();

    // Check if the downstream handler fell back to serving an HTML page (like index.html) for an API route
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html") && url.pathname.startsWith("/api/")) {
      Logger.warn(`Rota de API não encontrada ou fallback de HTML detectado em: ${url.pathname}`);
      return jsonResponse({
        success: false,
        error: "Rota não encontrada",
        message: `A rota de API '${url.pathname}' não foi encontrada ou está indisponível.`,
        data: null
      }, 404);
    }

    // Standardize all error responses to never return stack traces
    if (response.status === 500) {
      Logger.error(`Erro interno 500 retornado pelo endpoint: ${url.pathname}`);
      return jsonResponse({
        success: false,
        error: "Erro Interno",
        message: "Ocorreu um erro inesperado no processamento da rota.",
        data: null
      }, 500);
    }

    return response;

  } catch (err: any) {
    Logger.error(`Falha crítica no middleware da API em ${url.pathname}`, err);
    return jsonResponse({
      success: false,
      error: "Erro Interno",
      message: "Ocorreu uma falha de processamento interna na camada de segurança.",
      data: null
    }, 500);
  }
};
