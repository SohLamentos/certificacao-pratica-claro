import { Env, jsonResponse } from '../../_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return jsonResponse({ success: false, error: "Missing key" }, 400);
    }

    let bucket: any = null;
    if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.get === 'function') {
      bucket = env.EVIDENCIAS_BUCKET;
    }

    if (!bucket) {
      return jsonResponse({ success: false, error: "Serviço de Armazenamento R2 não configurado (EVIDENCIAS_BUCKET)" }, 500);
    }

    const object = await bucket.get(key);

    if (!object) {
      return new Response("File not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    // Force/fallback to correct Content-Type based on extension
    const lowerKey = key.toLowerCase();
    if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg")) {
      headers.set("Content-Type", "image/jpeg");
    } else if (lowerKey.endsWith(".png")) {
      headers.set("Content-Type", "image/png");
    } else if (lowerKey.endsWith(".webp")) {
      headers.set("Content-Type", "image/webp");
    }

    // Ensure private/no-store caching
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

    return new Response(object.body, {
      headers
    });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
};
