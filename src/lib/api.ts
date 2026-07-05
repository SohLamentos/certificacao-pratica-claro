export async function apiFetch(path: string, options: RequestInit = {}) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${path}${separator}_t=${Date.now()}`;

  return fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    }
  });
}
