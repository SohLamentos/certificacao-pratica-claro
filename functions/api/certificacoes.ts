import { initDb, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // 1. Cloudflare Cache API integration (Edge Cache)
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    let cache: any = null;
    
    if (typeof caches !== 'undefined') {
      try {
        cache = (caches as any).default;
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          // Returns cached response with an indicator header
          const newHeaders = new Headers(cachedResponse.headers);
          newHeaders.set('X-Cache', 'HIT - Cloudflare Cache API');
          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            headers: newHeaders
          });
        }
      } catch (e) {
        console.warn("Cache API match error:", e);
      }
    }

    // 2. Cloudflare KV integration as a fast L2 cache (reduces D1 reads)
    const kvKey = "cache:certificacoes:list";
    if (env.CLARO_KV) {
      try {
        const cachedList = await env.CLARO_KV.get(kvKey);
        if (cachedList) {
          const parsed = JSON.parse(cachedList);
          const response = jsonResponse(parsed);
          response.headers.set('X-Cache-KV', 'HIT - Cloudflare KV');
          
          // Cache in Cache API if enabled before returning
          if (cache) {
            const cacheResponse = response.clone();
            cacheResponse.headers.set('Cache-Control', 'public, max-age=60');
            await cache.put(cacheKey, cacheResponse);
          }
          return response;
        }
      } catch (e) {
        console.warn("KV get error:", e);
      }
    }

    // 3. Fallback to D1 Database
    await initDb(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT * FROM certificacoes ORDER BY id"
    ).all();

    const mapped = results.map((row: any) => ({
      id: row.nome,
      nome: row.nome,
      descricao: row.descricao,
      perfilPermitido: row.perfil_permitido,
      cor: row.cor,
      icone: row.icone,
      ativa: row.ativa === 1
    }));

    const response = jsonResponse(mapped);
    response.headers.set('X-Cache', 'MISS');

    // Store in KV with an expiration of 60 seconds (reduces DB reads under high load)
    if (env.CLARO_KV) {
      try {
        await env.CLARO_KV.put(kvKey, JSON.stringify(mapped), { expirationTtl: 60 });
      } catch (e) {
        console.warn("KV put error:", e);
      }
    }

    // Store in Edge cache
    if (cache) {
      try {
        const cacheResponse = response.clone();
        cacheResponse.headers.set('Cache-Control', 'public, max-age=60');
        await cache.put(cacheKey, cacheResponse);
      } catch (e) {
        console.warn("Cache API put error:", e);
      }
    }

    return response;
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao recuperar certificações",
      message: error.message
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;
    const result = await env.DB.prepare(
      "INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      data.nome,
      data.descricao || '',
      data.perfilPermitido,
      data.cor || '',
      data.icone || '',
      data.ativa ? 1 : 0
    ).run();

    const lastId = result.meta?.last_row_id || (result as any).lastRowId;

    // Cache Invalidation Strategy: Delete key from KV so subsequent requests query fresh from D1
    if (env.CLARO_KV) {
      try {
        await env.CLARO_KV.delete("cache:certificacoes:list");
      } catch (e) {
        console.warn("KV delete cache invalidation error:", e);
      }
    }

    return jsonResponse({ success: true, id: String(lastId) });
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: "Falha ao criar certificação",
      message: error.message
    }, 500);
  }
};
