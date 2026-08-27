import type { FastifyInstance } from 'fastify';
import type { SystemStatus } from '@ils/types';
import { publicOpts, type ApiContext } from '../context';

export function registerSystemRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/health', { schema: { hide: true }, config: { rateLimit: false } }, async () => ({ ok: true }));

  app.get(
    '/api/system/status',
    {
      schema: { tags: ['system'], summary: 'Sistem durumu: veritabanı, cache, WebSocket, ingestion' },
    },
    async (): Promise<SystemStatus> => {
      const db = await ctx.store.ping();
      const runs = await ctx.store.listRuns(1);
      const sources = await ctx.store.listSources();
      const lastSuccessAt = sources
        .map((s) => s.lastSuccessAt)
        .filter((v): v is string => v !== null)
        .sort()
        .at(-1);
      const degraded = !db.ok || sources.every((s) => s.status === 'OFFLINE' || s.status === 'DISABLED');
      return {
        status: degraded ? 'degraded' : 'ok',
        time: new Date().toISOString(),
        uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
        version: ctx.version,
        environment: ctx.env.NODE_ENV,
        database: { mode: ctx.store.mode, ok: db.ok, latencyMs: db.latencyMs },
        cache: { mode: ctx.cache.mode, ok: ctx.cache.ok() },
        websocket: { clients: ctx.wsClientCount() },
        ingestion: {
          mode: ctx.engine ? 'embedded' : ctx.env.DATABASE_URL ? 'worker' : 'unknown',
          lastRunAt: runs[0]?.startedAt ?? null,
          lastSuccessAt: lastSuccessAt ?? null,
        },
      };
    },
  );

  app.get(
    '/api/sources/status',
    {
      schema: { tags: ['system'], summary: 'Veri kaynağı sağlık durumu (AFAD, KANDİLLİ, …)' },
    },
    async () => ctx.cache.wrap('eq:sources:status', 5, () => ctx.store.listSources()),
  );

  app.get<{ Querystring: { q: string; limit?: number } }>(
    '/api/search',
    {
      schema: {
        tags: ['system'],
        summary: 'Global arama: deprem, konum, ilçe, fay',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 120 },
            limit: { type: 'integer', minimum: 1, maximum: 25, default: 8 },
          },
          required: ['q'],
        },
      },
    },
    async (req) => ctx.store.search(req.query.q, req.query.limit ?? 8, publicOpts(ctx.env)),
  );
}
