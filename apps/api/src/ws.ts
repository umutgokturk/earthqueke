import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { EventBus } from '@ils/database';
import type { AppEnv } from '@ils/config';
import type { WsServerEvent } from '@ils/types';

export interface WsHub {
  clientCount(): number;
  broadcast(event: WsServerEvent): void;
  close(): void;
}

/**
 * WebSocket hub at /ws. Forwards bus events (earthquake:new / updated,
 * sources:status, activity:update) to every connected client and emits a
 * heartbeat every 25 s so clients can detect dead connections and fall back
 * to polling.
 */
export function registerWsHub(app: FastifyInstance, bus: EventBus, env: AppEnv): WsHub {
  const clients = new Set<WebSocket>();
  const allowedOrigins = new Set(
    env.WEB_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );

  function broadcast(event: WsServerEvent): void {
    if (clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  const unsubscribe = bus.subscribe((message) => {
    if (message.type === 'command:ingestion:run') return;
    broadcast(message);
  });

  const heartbeat = setInterval(() => {
    broadcast({ type: 'heartbeat', serverTime: new Date().toISOString() });
  }, 25_000);
  heartbeat.unref?.();

  app.get('/ws', { websocket: true, config: { rateLimit: false }, schema: { hide: true } }, (socket, req) => {
    // In production only accept browser origins we serve the frontend from.
    const origin = req.headers.origin;
    if (env.isProduction && origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    clients.add(socket);
    socket.send(
      JSON.stringify({
        type: 'hello',
        serverTime: new Date().toISOString(),
        message: 'İSTANBUL LIVE SEISMIC canlı veri akışı',
      } satisfies WsServerEvent),
    );
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    socket.on('message', (raw: Buffer) => {
      // Client → server messages are only pings; answer to keep latency visible.
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'heartbeat', serverTime: new Date().toISOString() }));
        }
      } catch {
        /* ignore malformed client messages */
      }
    });
  });

  return {
    clientCount: () => clients.size,
    broadcast,
    close: () => {
      clearInterval(heartbeat);
      unsubscribe();
      for (const socket of clients) socket.close(1001, 'server shutdown');
      clients.clear();
    },
  };
}
