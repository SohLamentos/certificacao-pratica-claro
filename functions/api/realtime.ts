import { Env } from './_db';

// Declare global Cloudflare types so TypeScript doesn't complain in browser configuration
declare class WebSocketPair {
  constructor();
  [key: number]: any;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RealtimeHub) {
    return new Response("Durable Object namespace RealtimeHub not found", { status: 500 });
  }
  const id = env.RealtimeHub.idFromName("global");
  const obj = env.RealtimeHub.get(id);
  return obj.fetch(request);
};

export class RealtimeHub {
  state: any;
  sessions: Set<any>;

  constructor(state: any, env: any) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      const [client, server] = Object.values(new WebSocketPair() as any) as [any, any];

      server.accept();
      this.sessions.add(server);

      server.addEventListener("close", () => {
        this.sessions.delete(server);
      });

      server.addEventListener("error", () => {
        this.sessions.delete(server);
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as any);
    }

    if (request.method === "POST") {
      try {
        const payload = await request.text();
        this.broadcast(payload);
        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }

  broadcast(message: string) {
    for (const ws of this.sessions) {
      try {
        ws.send(message);
      } catch (err) {
        this.sessions.delete(ws);
      }
    }
  }
}
