import type { FastifyInstance } from 'fastify';
import { publicOpts, type ApiContext } from '../context';

export function registerRegionRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const opts = () => publicOpts(ctx.env);

  app.get(
    '/api/regions',
    {
      schema: {
        tags: ['regions'],
        summary: 'Bölgeler: İstanbul poligonu, Marmara Denizi, 39 ilçe (yaklaşık geometri)',
      },
    },
    async () => ctx.cache.wrap('eq:regions:list', 600, () => ctx.store.listRegions()),
  );

  app.get(
    '/api/regions/districts/stats',
    {
      schema: {
        tags: ['regions'],
        summary: 'İlçe bazlı istatistikler (harita paneli + ilçe dağılım grafiği)',
      },
    },
    async () => ctx.cache.wrap('eq:districts:stats', 60, () => ctx.store.allDistrictStats(opts())),
  );

  app.get<{ Params: { id: string } }>(
    '/api/regions/:id',
    {
      schema: {
        tags: ['regions'],
        summary: 'Bölge detayı (slug)',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 60 } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const region = await ctx.store.getRegion(req.params.id);
      if (!region) return reply.code(404).send({ error: 'not_found', message: 'Bölge bulunamadı.' });
      return region;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/regions/:id/stats',
    {
      schema: {
        tags: ['regions'],
        summary: 'Bölge istatistikleri (24s/7g/30g, maks/ort büyüklük, en yakın deprem)',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 60 } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const stats = await ctx.cache.wrap(`eq:region:${req.params.id}:stats`, 60, () =>
        ctx.store.regionStats(req.params.id, opts()),
      );
      if (!stats) return reply.code(404).send({ error: 'not_found', message: 'Bölge bulunamadı.' });
      return stats;
    },
  );
}
