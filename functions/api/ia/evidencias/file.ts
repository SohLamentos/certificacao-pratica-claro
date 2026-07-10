import { initDb, Env, jsonResponse } from '../../_db';

const getDeletedPlaceholderSvg = (): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="100%" height="100%" fill="#f9fafb" rx="8"/>
  <rect width="99%" height="99%" x="0.5%" y="0.5%" fill="none" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="6,6" rx="8"/>
  <g transform="translate(0, 0)">
    <!-- Lock outline icon -->
    <path d="M300,120 C280,120 270,135 270,150 L270,170 L260,170 C254,170 250,174 250,180 L250,240 C250,246 254,250 260,250 L340,250 C346,250 350,246 350,240 L350,180 C350,174 346,170 340,170 L330,170 L330,150 C330,135 320,120 300,120 Z M285,150 C285,142 290,135 300,135 C310,135 315,142 315,150 L315,170 L285,170 L285,150 Z" fill="#9ca3af"/>
    <!-- Exclusion text -->
    <text x="50%" y="280" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" fill="#374151">
      Evidência excluída automaticamente
    </text>
    <text x="50%" y="308" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" fill="#6b7280">
      após o prazo de retenção de 30 dias.
    </text>
  </g>
</svg>
`;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return jsonResponse({ success: false, error: "Missing key" }, 400);
    }

    // Check if the evidence has been marked as deleted in D1
    const isDeletedIa = await env.DB.prepare(
      "SELECT id FROM ia_evidencias WHERE (arquivo_key = ? OR id = ?) AND arquivo_excluido = 1"
    ).bind(key, key).first();

    const isDeletedEv = await env.DB.prepare(
      "SELECT id FROM evidencias WHERE (r2_key = ? OR id = ?) AND arquivo_excluido = 1"
    ).bind(key, key).first();

    if (isDeletedIa || isDeletedEv) {
      return new Response(getDeletedPlaceholderSvg(), {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }

    let bucket: any = null;
    if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.get === 'function') {
      bucket = env.EVIDENCIAS_BUCKET;
    }

    if (!bucket) {
      return jsonResponse({ success: false, error: "Serviço de Armazenamento R2 não configurado (EVIDENCIAS_BUCKET)" }, 500);
    }

    // Support serving the protected preview key if available
    let targetKey = key;
    const isProtectedIa = await env.DB.prepare(
      "SELECT protected_preview_r2_key FROM ia_evidencias WHERE (arquivo_key = ? OR id = ?) AND (risco_lgpd = 1 OR risco_lgpd = 'ALTO') AND protected_preview_r2_key IS NOT NULL AND protected_preview_r2_key != ''"
    ).bind(key, key).first() as { protected_preview_r2_key: string | null } | null;

    const isProtectedEv = await env.DB.prepare(
      "SELECT protected_preview_r2_key FROM evidencias WHERE (r2_key = ? OR id = ?) AND (risco_lgpd = 1 OR risco_lgpd = 'ALTO') AND protected_preview_r2_key IS NOT NULL AND protected_preview_r2_key != ''"
    ).bind(key, key).first() as { protected_preview_r2_key: string | null } | null;

    const protectedKey = (isProtectedIa?.protected_preview_r2_key) || (isProtectedEv?.protected_preview_r2_key);
    
    // Check feature flag for protected preview
    const enableProtected = env.ENABLE_PROTECTED_PREVIEW === true || env.ENABLE_PROTECTED_PREVIEW === 'true' || String(env.ENABLE_PROTECTED_PREVIEW) === '1' || String(env.ENABLE_PROTECTED_PREVIEW).toLowerCase() === 'true';
    const isBypass = url.searchParams.get("bypass") === "true";

    if (protectedKey && (url.searchParams.get("protected") === "true" || (enableProtected && !isBypass))) {
      targetKey = protectedKey;
    }

    const object = await bucket.get(targetKey);

    if (!object) {
      // Fallback: if file doesn't exist in R2, serve the placeholder SVG instead of a broken image
      return new Response(getDeletedPlaceholderSvg(), {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, no-cache, no-store, must-revalidate"
        }
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    // Force/fallback to correct Content-Type based on extension
    const lowerKey = targetKey.toLowerCase();
    if (lowerKey.endsWith(".svg")) {
      headers.set("Content-Type", "image/svg+xml");
    } else if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg")) {
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
