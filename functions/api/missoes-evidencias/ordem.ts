import { initDb, Env, jsonResponse } from '../_db';
import { logEvent, LogLevel } from '../_logger';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    await initDb(env.DB);

    if (request.method !== 'PUT') {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const data = await request.json() as any;
    const { orders, user } = data; // orders: Array<{ id: string, ordem: number }>

    if (!orders || !Array.isArray(orders)) {
      return jsonResponse({ success: false, error: "Parâmetro 'orders' deve ser um array." }, 400);
    }

    const statements = orders.map(o => 
      env.DB.prepare("UPDATE missoes_evidencias SET ordem = ?, updated_at = ? WHERE id = ?").bind(
        o.ordem,
        new Date().toISOString(),
        o.id
      )
    );

    await (env.DB as any).batch(statements);

    // Log audit event: MISSAO_REORDENADA
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const userAgent = request.headers.get("User-Agent") || "Unknown";
    await logEvent(env, {
      tipo: LogLevel.AUDITORIA,
      evento: "MISSAO_REORDENADA",
      usuario_id: user || "analista",
      perfil: "analista",
      ip: clientIp,
      userAgent,
      metadata: {
        total_reordenado: orders.length
      }
    });

    return jsonResponse({
      success: true,
      message: "Ordem das missões atualizada com sucesso."
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
