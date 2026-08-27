import type { FastifyInstance } from 'fastify';
import { computeActivity } from '@ils/gis';
import { rangeToMs, type TimeRange } from '@ils/types';
import { publicOpts, type ApiContext } from '../context';

/**
 * Activity index endpoints. The index is an observational statistic and every
 * response carries the mandatory disclaimer — it is NOT an earthquake
 * prediction and must never be presented as one.
 */
export function registerActivityRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get<{ Querystring: { region?: string } }>(
    '/api/activity',
    {
      schema: {
        tags: ['activity'],
        summary: 'Aktivite indeksi (gözlemsel istatistik — deprem tahmini DEĞİLDİR)',
        querystring: {
          type: 'object',
          properties: { region: { type: 'string', enum: ['all', 'istanbul', 'marmara'] } },
        },
      },
    },
    async (req) => {
      const region = req.query.region;
      return ctx.cache.wrap(`eq:activity:${region ?? 'every'}`, 15, async () => {
        const stored = await ctx.store.latestActivity(region);
        if (stored.length > 0) return stored;
        // No snapshot yet (fresh boot) — compute on demand from the store.
        const regions = region ? [region] : ['all', 'istanbul', 'marmara'];
        const out = [];
        for (const slug of regions) {
          const events = await ctx.store.eventsForActivity(slug === 'all' ? undefined : slug, publicOpts(ctx.env));
          out.push(computeActivity({ events, region: slug }));
        }
        return out;
      });
    },
  );

  app.get<{ Querystring: { region?: string; range?: TimeRange } }>(
    '/api/activity/timeline',
    {
      schema: {
        tags: ['activity'],
        summary: 'Aktivite indeksi zaman serisi',
        querystring: {
          type: 'object',
          properties: {
            region: { type: 'string', enum: ['all', 'istanbul', 'marmara'], default: 'istanbul' },
            range: { type: 'string', enum: ['1h', '6h', '24h', '7d', '30d'], default: '24h' },
          },
        },
      },
    },
    async (req) => {
      const region = req.query.region ?? 'istanbul';
      const range = req.query.range ?? '24h';
      const now = Date.now();
      return ctx.cache.wrap(`eq:activity:tl:${region}:${range}`, 30, () =>
        ctx.store.activityTimeline(
          region,
          new Date(now - rangeToMs(range)).toISOString(),
          new Date(now).toISOString(),
        ),
      );
    },
  );
}
