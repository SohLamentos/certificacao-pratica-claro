import { apiFetch, isBackendAvailable } from './api';

export function connectRealtime(onLogout: () => void) {
  const isRealtimeConfigured = process.env.ENABLE_REALTIME === 'true';

  if (!isRealtimeConfigured) {
    console.log("Realtime is disabled (ENABLE_REALTIME=false). Skipping WebSocket and API checks.");
    return () => {}; // return cleanup function
  }

  let ws: WebSocket | null = null;
  let reconnectTimeout: any = null;
  let pollingInterval: any = null;
  let isClosedCleanly = false;

  async function pollCqs() {
    if (!isBackendAvailable) {
      console.log("Backend not detected as active. Skipping poll.");
      return;
    }
    try {
      const res = await apiFetch('/api/cqs');
      if (!res.ok) return;
      const cqs: any[] = await res.json();
      if (!Array.isArray(cqs)) return; // Safety check

      // Check if our currently selected evaluator is still active and exists in the new list
      const cqSaved = localStorage.getItem('claro_cq_selecionado');
      const analistaSaved = localStorage.getItem('claro_analista_selecionado');
      const currentProfile = localStorage.getItem('claro_cq_profile');

      let currentId: string | null = null;
      if (currentProfile === 'CQ' && cqSaved) {
        try { currentId = String(JSON.parse(cqSaved).id); } catch (e) {}
      } else if (currentProfile === 'Analista' && analistaSaved) {
        try { currentId = String(JSON.parse(analistaSaved).id); } catch (e) {}
      }

      if (currentId) {
        const currentEvaluator = cqs.find(item => String(item.id) === currentId);
        if (!currentEvaluator || currentEvaluator.status === 'Inativo') {
          console.warn("Current evaluator is deleted or inactive. Logging out...");
          checkAndClearSession(currentId);
          onLogout();
          return;
        }
      }

      // Dispatch diff-check events to update lists in CQManagerView in real-time
      const prevCqsStr = sessionStorage.getItem('prev_polled_cqs');
      if (prevCqsStr) {
        try {
          const prevCqs: any[] = JSON.parse(prevCqsStr);
          if (Array.isArray(prevCqs)) {
            // Detect deleted
            for (const prev of prevCqs) {
              const stillExists = cqs.some(c => String(c.id) === String(prev.id));
              if (!stillExists) {
                window.dispatchEvent(new CustomEvent('realtime-cq-event', {
                  detail: { type: 'AVALIADOR_DELETADO', avaliadorId: prev.id }
                }));
              }
            }
            // Detect updated
            for (const curr of cqs) {
              const prev = prevCqs.find(p => String(p.id) === String(curr.id));
              if (prev && prev.status !== curr.status) {
                window.dispatchEvent(new CustomEvent('realtime-cq-event', {
                  detail: { type: 'AVALIADOR_ATUALIZADO', avaliadorId: curr.id, status: curr.status }
                }));
              }
            }
          }
        } catch (e) {}
      }
      sessionStorage.setItem('prev_polled_cqs', JSON.stringify(cqs));
    } catch (err) {
      console.error("Error polling CQs:", err);
    }
  }

  function startPolling() {
    if (isClosedCleanly) return;
    pollCqs();
    pollingInterval = setInterval(pollCqs, 10000);
  }

  function connect() {
    if (isClosedCleanly) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/realtime`;

    console.log("Connecting to WebSocket at:", wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Realtime event received:", data);

        if (data.type === 'AVALIADOR_DELETADO' || data.type === 'AVALIADOR_ATUALIZADO') {
          const targetId = data.avaliadorId;
          let shouldLogout = false;

          if (data.type === 'AVALIADOR_DELETADO') {
            shouldLogout = checkAndClearSession(targetId);
          } else if (data.type === 'AVALIADOR_ATUALIZADO' && data.status === 'Inativo') {
            shouldLogout = checkAndClearSession(targetId);
          }

          // Dispatch custom event for views (like CQManagerView or App) to update lists in real-time
          window.dispatchEvent(new CustomEvent('realtime-cq-event', { detail: data }));

          if (shouldLogout) {
            console.warn("Current evaluator was deleted or inactivated. Logging out...");
            onLogout();
          }
        }
      } catch (e) {
        console.error("Error processing websocket message:", e);
      }
    };

    ws.onclose = () => {
      if (isClosedCleanly) return;
      console.log("WebSocket disconnected. Reconnecting in 3s...");
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }

  async function checkRealtimeStatus() {
    if (!isBackendAvailable) {
      console.warn("Backend not active/available. Realtime connection and polling disabled.");
      return;
    }

    try {
      const res = await apiFetch('/api/realtime');
      if (res.ok) {
        const data = await res.json() as { enabled: boolean };
        if (data && data.enabled) {
          console.log("Realtime enabled on backend. Initializing WebSocket...");
          connect();
        } else {
          console.log("Realtime disabled on backend. Initializing simple polling...");
          startPolling();
        }
      } else {
        console.warn("Could not retrieve realtime status. Falling back to simple polling.");
        startPolling();
      }
    } catch (e) {
      console.error("Error checking realtime status, falling back to simple polling:", e);
      startPolling();
    }
  }

  // Delay the check slightly to allow isBackendAvailable to be computed by the first API calls on app mount
  setTimeout(checkRealtimeStatus, 2000);

  return () => {
    isClosedCleanly = true;
    clearTimeout(reconnectTimeout);
    clearInterval(pollingInterval);
    if (ws) {
      ws.close();
    }
  };
}

function checkAndClearSession(id: string): boolean {
  let matched = false;
  const targetIdStr = String(id);

  const cqSaved = localStorage.getItem('claro_cq_selecionado');
  if (cqSaved) {
    try {
      const cq = JSON.parse(cqSaved);
      if (String(cq.id) === targetIdStr) {
        matched = true;
      }
    } catch (e) {}
  }

  const analistaSaved = localStorage.getItem('claro_analista_selecionado');
  if (analistaSaved) {
    try {
      const analista = JSON.parse(analistaSaved);
      if (String(analista.id) === targetIdStr) {
        matched = true;
      }
    } catch (e) {}
  }

  if (matched) {
    localStorage.removeItem('claro_cq_selecionado');
    localStorage.removeItem('claro_analista_selecionado');
    localStorage.removeItem('claro_cq_profile');
    return true;
  }

  return false;
}
