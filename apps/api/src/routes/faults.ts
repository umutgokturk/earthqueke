import type { FastifyInstance } from 'fastify';
import type { EarthquakeQuery, TimeRange } from '@ils/types';
import { publicOpts, type ApiContext } from '../context';

export function registerFaultRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const opts = () => publicOpts(ctx.env);

  app.get(
    '/api/faults',
    {
      schema: {
        tags: ['faults'],
        summary: 'Fay segmentleri (GeoJSON geometri + kaynak/lisans metadatası)',
      },
    },
    async () => ctx.cache.wrap('eq:faults:list', 300, () => ctx.store.listFaults()),
  );

  app.get(
    '/api/faults/stats',
    {
      schema: {
        tags: ['faults'],
        summary: 'Tüm segmentler için özet istatistikler (24s/7g/30g, maks/ort büyüklük)',
      },
    },
    async () => ctx.cache.wrap('eq:faults:stats', 30, () => ctx.store.allFaultStats(opts())),
  );

  app.get<{ Params: { id: string } }>(
    '/api/faults/:id',
    {
      schema: {
        tags: ['faults'],
        summary: 'Fay segmenti detayı (id veya slug)',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const fault = await ctx.store.getFault(req.params.id);
      if (!fault) return reply.code(404).send({ error: 'not_found', message: 'Fay segmenti bulunamadı.' });
      return fault;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/faults/:id/stats',
    {
      schema: {
        tags: ['faults'],
        summary: 'Segment istatistikleri (ilişkilendirme: en yakın segment ≤ 10 km)',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const stats = await ctx.cache.wrap(`eq:fault:${req.params.id}:stats`, 30, () =>
        ctx.store.faultStats(req.params.id, opts()),
      );
      if (!stats) return reply.code(404).send({ error: 'not_found', message: 'Fay segmenti bulunamadı.' });
      return stats;
    },
  );

  app.get<{ Params: { id: string }; Querystring: { range?: TimeRange; limit?: number; offset?: number } }>(
    '/api/faults/:id/earthquakes',
    {
      schema: {
        tags: ['faults'],
        summary: 'Segmentle ilişkilendirilen depremler',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } }, required: ['id'] },
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['1h', '6h', '24h', '7d', '30d'] },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const fault = await ctx.store.getFault(req.params.id);
      if (!fault) return reply.code(404).send({ error: 'not_found', message: 'Fay segmenti bulunamadı.' });
      const query: EarthquakeQuery = {
        faultId: fault.id,
        range: req.query.range,
        limit: req.query.limit,
        offset: req.query.offset,
      };
      return ctx.store.queryEarthquakes(query, opts());
    },
  );
}
