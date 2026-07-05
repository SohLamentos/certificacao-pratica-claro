export function connectRealtime(onLogout: () => void) {
  let ws: WebSocket | null = null;
  let reconnectTimeout: any = null;
  let isClosedCleanly = false;

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
      // Let onclose handle the reconnection
    };
  }

  connect();

  return () => {
    isClosedCleanly = true;
    clearTimeout(reconnectTimeout);
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
