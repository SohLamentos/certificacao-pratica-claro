import { Env, initDb, jsonResponse } from './_db';
import { AuthService } from './_services';
import { Logger } from './_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Public Authentication Route Bypass
  if (url.pathname.startsWith('/api/auth/login')) {
    return await context.next();
  }

  // 2. Serve static/uploaded files with valid session
  // (Always validate token for file downloads too, as demanded: "Todas as rotas devem validar autenticação")
  
  try {
    // Ensure the D1 database is initialized (triggers migration exactly once)
    await initDb(env.DB);

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
    const salt = env.LGPD_HASH_SALT || "claro_cq_lgpd_salt_2026_prod";
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
