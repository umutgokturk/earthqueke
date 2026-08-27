import type { FastifyInstance } from 'fastify';
import { bucketForRange, rangeToMs, type DistributionKind, type EarthquakeQuery, type TimeRange } from '@ils/types';
import { publicOpts, type ApiContext } from '../context';
import { earthquakesToCsv } from '../csv';

const RANGE_ENUM = ['1h', '6h', '24h', '7d', '30d'];
const SOURCE_ENUM = ['AFAD', 'KANDILLI', 'MOCK', 'OTHER', 'ALL'];

const filterQuerySchema = {
  type: 'object',
  properties: {
    range: { type: 'string', enum: RANGE_ENUM, description: 'Hazır zaman aralığı' },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    minMagnitude: { type: 'number', minimum: 0, maximum: 10 },
    maxMagnitude: { type: 'number', minimum: 0, maximum: 10 },
    minDepth: { type: 'number', minimum: 0 },
    maxDepth: { type: 'number', minimum: 0 },
    source: { type: 'string', enum: SOURCE_ENUM },
    region: { type: 'string', maxLength: 60, description: 'Bölge slug (istanbul, marmara, ilçe slug)' },
    faultId: { type: 'string', maxLength: 80, description: 'Fay id veya slug' },
    search: { type: 'string', maxLength: 120 },
    order: { type: 'string', enum: ['time_desc', 'time_asc', 'magnitude_desc'] },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

type FilterQuery = EarthquakeQuery & { range?: TimeRange };

function toStoreQuery(q: FilterQuery): EarthquakeQuery {
  const { range, ...rest } = q;
  const from = rest.from ?? (range ? new Date(Date.now() - rangeToMs(range)).toISOString() : undefined);
  return { ...rest, from };
}

export function registerEarthquakeRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const opts = () => publicOpts(ctx.env);

  app.get<{ Querystring: FilterQuery }>(
    '/api/earthquakes',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Filtrelenebilir deprem listesi',
        querystring: filterQuerySchema,
      },
    },
    async (req) => ctx.store.queryEarthquakes(toStoreQuery(req.query), opts()),
  );

  app.get<{ Querystring: { limit?: number; since?: string } }>(
    '/api/earthquakes/latest',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'En son depremler (canlı tablo + polling fallback)',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 30 },
            since: { type: 'string', format: 'date-time', description: 'Bu zamandan sonrakiler (polling)' },
          },
        },
      },
    },
    async (req) => {
      const limit = req.query.limit ?? 30;
      const since = req.query.since;
      const key = `eq:latest:${limit}:${since ?? ''}`;
      return ctx.cache.wrap(key, 10, () => ctx.store.latestEarthquakes(limit, since, opts()));
    },
  );

  app.get<{ Querystring: { region?: string } }>(
    '/api/earthquakes/stats',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'KPI istatistikleri (1s/24s/7g sayıları, maks. büyüklük, ort. derinlik, en yakın deprem)',
        querystring: {
          type: 'object',
          properties: { region: { type: 'string', maxLength: 60 } },
        },
      },
    },
    async (req) =>
      ctx.cache.wrap(`eq:stats:${req.query.region ?? 'all'}`, 15, () =>
        ctx.store.dashboardStats(req.query.region, opts()),
      ),
  );

  app.get<{ Querystring: { range?: TimeRange; region?: string; minMagnitude?: number } }>(
    '/api/earthquakes/timeline',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Zaman serisi (backend agregasyonu, boş kovalar dahil)',
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: RANGE_ENUM, default: '24h' },
            region: { type: 'string', maxLength: 60 },
            minMagnitude: { type: 'number', minimum: 0, maximum: 10 },
          },
        },
      },
    },
    async (req) => {
      const range = req.query.range ?? '24h';
      const now = Date.now();
      const key = `eq:timeline:${range}:${req.query.region ?? 'all'}:${req.query.minMagnitude ?? 0}`;
      return ctx.cache.wrap(key, 30, () =>
        ctx.store.timeline({
          from: new Date(now - rangeToMs(range)).toISOString(),
          to: new Date(now).toISOString(),
          bucketMs: bucketForRange(range),
          region: req.query.region,
          minMagnitude: req.query.minMagnitude,
          includeSynthetic: opts().includeSynthetic,
        }),
      );
    },
  );

  app.get<{ Querystring: { kind?: DistributionKind; range?: TimeRange; region?: string } }>(
    '/api/earthquakes/distribution',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Dağılımlar: magnitude / depth / fault / district / hour / day',
        querystring: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['magnitude', 'depth', 'fault', 'district', 'hour', 'day'],
              default: 'magnitude',
            },
            range: { type: 'string', enum: RANGE_ENUM, default: '7d' },
            region: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (req) => {
      const kind = req.query.kind ?? 'magnitude';
      const range = req.query.range ?? '7d';
      const now = Date.now();
      const key = `eq:dist:${kind}:${range}:${req.query.region ?? 'all'}`;
      return ctx.cache.wrap(key, 60, () =>
        ctx.store.distribution(
          kind,
          new Date(now - rangeToMs(range)).toISOString(),
          new Date(now).toISOString(),
          req.query.region,
          opts(),
        ),
      );
    },
  );

  app.get<{ Querystring: { range?: TimeRange; region?: string; limit?: number } }>(
    '/api/earthquakes/scatter',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Scatter verisi (magnitude–derinlik, zaman–magnitude)',
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: RANGE_ENUM, default: '7d' },
            region: { type: 'string', maxLength: 60 },
            limit: { type: 'integer', minimum: 10, maximum: 2000, default: 750 },
          },
        },
      },
    },
    async (req) => {
      const range = req.query.range ?? '7d';
      const now = Date.now();
      const key = `eq:scatter:${range}:${req.query.region ?? 'all'}:${req.query.limit ?? 750}`;
      return ctx.cache.wrap(key, 60, () =>
        ctx.store.scatter(
          new Date(now - rangeToMs(range)).toISOString(),
          new Date(now).toISOString(),
          req.query.region,
          req.query.limit ?? 750,
          opts(),
        ),
      );
    },
  );

  app.get<{ Querystring: FilterQuery }>(
    '/api/earthquakes/export',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'CSV dışa aktarım (filtreleri dikkate alır, Europe/Istanbul saatleri)',
        querystring: filterQuerySchema,
        produces: ['text/csv'],
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const query = toStoreQuery({ ...req.query, limit: undefined, offset: undefined });
      const page = await ctx.store.queryEarthquakes({ ...query, limit: 500, offset: 0 }, opts());
      const events = [...page.items];
      let offset = 500;
      while (events.length < page.total && offset < 50_000) {
        const next = await ctx.store.queryEarthquakes({ ...query, limit: 500, offset }, opts());
        events.push(...next.items);
        if (next.items.length === 0) break;
        offset += 500;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="istanbul-live-seismic-${stamp}.csv"`);
      return earthquakesToCsv(events);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/earthquakes/:id',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Deprem detayı (kaynaklar, en yakın fay, mesafeler)',
        params: {
          type: 'object',
          properties: { id: { type: 'string', maxLength: 80 } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const event = await ctx.store.getEarthquake(req.params.id);
      if (!event) {
        return reply.code(404).send({ error: 'not_found', message: 'Deprem kaydı bulunamadı.' });
      }
      if (ctx.env.isProduction && event.dataClass !== 'live') {
        return reply.code(404).send({ error: 'not_found', message: 'Deprem kaydı bulunamadı.' });
      }
      return event;
    },
  );

  app.get<{ Params: { id: string }; Querystring: { radiusKm?: number; days?: number } }>(
    '/api/earthquakes/:id/nearby',
    {
      schema: {
        tags: ['earthquakes'],
        summary: 'Aynı bölgedeki yakın tarihli depremler',
        params: {
          type: 'object',
          properties: { id: { type: 'string', maxLength: 80 } },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            radiusKm: { type: 'number', minimum: 1, maximum: 200, default: 30 },
            days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
          },
        },
      },
    },
    async (req, reply) => {
      const event = await ctx.store.getEarthquake(req.params.id);
      if (!event) {
        return reply.code(404).send({ error: 'not_found', message: 'Deprem kaydı bulunamadı.' });
      }
      return ctx.store.nearbyEarthquakes(
        event.latitude,
        event.longitude,
        req.query.radiusKm ?? 30,
        req.query.days ?? 30,
        event.id,
        opts(),
      );
    },
  );
}
