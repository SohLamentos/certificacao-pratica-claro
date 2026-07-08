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

  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers
  });

  // Automatically clear expired session token on 401
  if (response.status === 401) {
    localStorage.removeItem('claro_cq_auth_token');
  }

  return response;
}
