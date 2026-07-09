export let isBackendAvailable = false;

function getFallbackDataForPath(path: string): any {
  const urlPath = path.split('?')[0];
  
  if (urlPath.endsWith('/realtime')) {
    return { enabled: false };
  }
  if (urlPath.endsWith('/lgpd')) {
    return { success: true, configs: {} };
  }
  if (urlPath.endsWith('/dashboard')) {
    return { success: true, data: {} };
  }
  if (urlPath.endsWith('/knowledge_base')) {
    return { success: true, data: [] };
  }
  if (urlPath.endsWith('/login')) {
    return { success: false, error: "Serviço Indisponível", message: "O servidor de autenticação está offline." };
  }
  
  // By default, list/resource endpoints expect arrays:
  // /api/certificacoes, /api/cqs, /api/avaliacoes, /api/tecnicos, /api/itens, /api/ia/evidencias, /api/ia/feedback
  return [];
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${path}${separator}_t=${Date.now()}`;

  const token = localStorage.getItem('claro_cq_auth_token') || '';
  const profile = localStorage.getItem('claro_cq_profile') || '';

  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (profile) {
    headers['x-auth-profile'] = profile;
  }

  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers
    });

    const contentType = response.headers.get("Content-Type") || "";
    const isHtml = contentType.includes("text/html");

    // Check if response is HTML or 404
    if (isHtml || response.status === 404) {
      console.warn(`[API Client fallback] Path '${path}' returned HTML or 404. Returning safe fallback data.`);
      isBackendAvailable = false;
      const fallbackData = getFallbackDataForPath(path);
      const mockResponse = new Response(JSON.stringify(fallbackData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      return mockResponse;
    }

    // Set backend availability on a successful JSON/non-HTML response
    isBackendAvailable = true;

    // Decorate the response.json method to safely handle non-JSON responses and HTML fallbacks
    response.json = async function () {
      try {
        const text = await response.clone().text();
        const trimmed = text.trim();
        if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype html') || trimmed.toLowerCase().startsWith('<html')) {
          console.error("API returned HTML instead of JSON for path:", path, trimmed.substring(0, 150));
          isBackendAvailable = false;
          return getFallbackDataForPath(path);
        }
        return JSON.parse(trimmed);
      } catch (err) {
        console.error("Failed to parse JSON response for path:", path, err);
        return getFallbackDataForPath(path);
      }
    };

    // Automatically clear expired session token on 401
    if (response.status === 401) {
      localStorage.removeItem('claro_cq_auth_token');
    }

    return response;
  } catch (error) {
    console.warn(`[API Client network fallback] Failed to fetch path '${path}'. Returning safe fallback data.`, error);
    isBackendAvailable = false;
    const fallbackData = getFallbackDataForPath(path);
    const mockResponse = new Response(JSON.stringify(fallbackData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    return mockResponse;
  }
}
