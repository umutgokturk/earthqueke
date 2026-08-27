import type { FastifyInstance } from 'fastify';
import type { FaultSegment, SourceId } from '@ils/types';
import type { FaultUpsert } from '@ils/database';
import { ADMIN_COOKIE, type AdminAuth } from '../auth';
import type { ApiContext } from '../context';

const geometrySchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['LineString', 'MultiLineString'] },
    coordinates: { type: 'array' },
  },
  required: ['type', 'coordinates'],
} as const;

interface FaultBody {
  slug: string;
  name: string;
  segmentType?: string;
  description?: string;
  geometry: FaultSegment['geometry'];
  approximate?: boolean;
  isZone?: boolean;
  source: string;
  sourceUrl?: string;
  license?: string;
  lastVerified?: string | null;
}

/** Basic structural validation of fault geometry coordinates. */
function validGeometry(geometry: FaultSegment['geometry']): boolean {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(lines) || lines.length === 0) return false;
  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 2) return false;
    for (const pos of line) {
      if (!Array.isArray(pos) || pos.length < 2) return false;
      const [lon, lat] = pos;
      if (typeof lon !== 'number' || typeof lat !== 'number') return false;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    }
  }
  return true;
}

export function registerAdminRoutes(app: FastifyInstance, ctx: ApiContext, auth: AdminAuth): void {
  app.post<{ Body: { username: string; password: string } }>(
    '/api/admin/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin'],
        summary: 'Admin girişi (httpOnly cookie oturumu)',
        body: {
          type: 'object',
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 80 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
          required: ['username', 'password'],
        },
      },
    },
    async (req, reply) => {
      const ok = await auth.verifyCredentials(req.body.username, req.body.password);
      if (!ok) {
        await ctx.store.logEvent({
          level: 'WARN',
          service: 'api',
          event: 'admin.login_failed',
          message: `Başarısız admin girişi (${req.ip})`,
        });
        return reply.code(401).send({ error: 'unauthorized', message: 'Kullanıcı adı veya şifre hatalı.' });
      }
      const token = app.jwt.sign({ username: req.body.username, role: 'admin' }, { expiresIn: '12h' });
      reply.setCookie(ADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: ctx.env.isProduction,
        path: '/',
        maxAge: 12 * 3600,
      });
      await ctx.store.logEvent({
        level: 'INFO',
        service: 'api',
        event: 'admin.login',
        message: `Admin girişi: ${req.body.username}`,
      });
      return { ok: true, username: req.body.username };
    },
  );

  app.post('/api/admin/logout', { schema: { tags: ['admin'], summary: 'Oturumu kapat' } }, async (_req, reply) => {
    reply.clearCookie(ADMIN_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get(
    '/api/admin/me',
    { preHandler: auth.requireAdmin, schema: { tags: ['admin'], summary: 'Oturum bilgisi' } },
    async (req) => ({ ok: true, user: req.user }),
  );

  app.get(
    '/api/admin/overview',
    { preHandler: auth.requireAdmin, schema: { tags: ['admin'], summary: 'Admin özet paneli' } },
    async () => {
      const [stats, sources, runs, db] = await Promise.all([
        ctx.store.dashboardStats(undefined, { includeSynthetic: !ctx.env.isProduction }),
        ctx.store.listSources(),
        ctx.store.listRuns(10),
        ctx.store.ping(),
      ]);
      return {
        stats,
        sources,
        runs,
        database: { mode: ctx.store.mode, ok: db.ok, latencyMs: db.latencyMs },
        cache: { mode: ctx.cache.mode, ok: ctx.cache.ok() },
        websocketClients: ctx.wsClientCount(),
        ingestionMode: ctx.engine ? 'embedded' : 'worker',
        environment: ctx.env.NODE_ENV,
      };
    },
  );

  app.get(
    '/api/admin/sources',
    { preHandler: auth.requireAdmin, schema: { tags: ['admin'], summary: 'Veri kaynakları' } },
    async () => ctx.store.listSources(),
  );

  app.patch<{ Params: { id: SourceId }; Body: { enabled: boolean } }>(
    '/api/admin/sources/:id',
    {
      preHandler: auth.requireAdminMutation,
      schema: {
        tags: ['admin'],
        summary: 'Kaynağı aç/kapat',
        params: { type: 'object', properties: { id: { type: 'string', enum: ['AFAD', 'KANDILLI', 'MOCK', 'OTHER'] } }, required: ['id'] },
        body: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
      },
    },
    async (req, reply) => {
      const updated = await ctx.store.patchSource(req.params.id, {
        enabled: req.body.enabled,
        status: req.body.enabled ? 'UNKNOWN' : 'DISABLED',
      });
      if (!updated) return reply.code(404).send({ error: 'not_found', message: 'Kaynak bulunamadı.' });
      await ctx.store.logEvent({
        level: 'INFO',
        service: 'api',
        event: 'admin.source_toggled',
        message: `${req.params.id} ${req.body.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`,
      });
      await ctx.cache.del('eq:sources:');
      return updated;
    },
  );

  app.get<{ Querystring: { limit?: number } }>(
    '/api/admin/ingestion/runs',
    {
      preHandler: auth.requireAdmin,
      schema: {
        tags: ['admin'],
        summary: 'Ingestion çalıştırma geçmişi',
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        },
      },
    },
    async (req) => ctx.store.listRuns(req.query.limit ?? 50),
  );

  app.post<{ Body: { source?: SourceId } }>(
    '/api/admin/ingestion/run',
    {
      preHandler: auth.requireAdminMutation,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin'],
        summary: 'Manuel ingestion tetikle',
        body: {
          type: 'object',
          properties: { source: { type: 'string', enum: ['AFAD', 'KANDILLI', 'MOCK'] } },
        },
      },
    },
    async (req, reply) => {
      if (ctx.engine) {
        const summaries = await ctx.engine.runCycle(req.body?.source);
        return { ok: true, mode: 'embedded', summaries };
      }
      if (ctx.bus.mode === 'redis') {
        await ctx.bus.publish({ type: 'command:ingestion:run', source: req.body?.source });
        return reply.code(202).send({ ok: true, mode: 'worker', message: 'Komut worker sürecine iletildi.' });
      }
      return reply.code(503).send({
        error: 'unavailable',
        message: 'Worker süreci ayrı çalışıyor ancak Redis bus yapılandırılmamış — komut iletilemiyor.',
      });
    },
  );

  app.get(
    '/api/admin/faults',
    { preHandler: auth.requireAdmin, schema: { tags: ['admin'], summary: 'Fay segmentleri (yönetim)' } },
    async () => ctx.store.listFaults(),
  );

  app.post<{ Body: FaultBody }>(
    '/api/admin/faults',
    {
      preHandler: auth.requireAdminMutation,
      schema: {
        tags: ['admin'],
        summary: 'Fay segmenti ekle/güncelle (GeoJSON import, kaynak metadatası zorunlu)',
        body: {
          type: 'object',
          properties: {
            slug: { type: 'string', minLength: 2, maxLength: 80, pattern: '^[a-z0-9-]+$' },
            name: { type: 'string', minLength: 2, maxLength: 160 },
            segmentType: { type: 'string', maxLength: 80 },
            description: { type: 'string', maxLength: 2000 },
            geometry: geometrySchema,
            approximate: { type: 'boolean', default: true },
            isZone: { type: 'boolean', default: false },
            source: { type: 'string', minLength: 3, maxLength: 500 },
            sourceUrl: { type: 'string', maxLength: 500 },
            license: { type: 'string', maxLength: 500 },
            lastVerified: { type: ['string', 'null'] },
          },
          required: ['slug', 'name', 'geometry', 'source'],
        },
      },
    },
    async (req, reply) => {
      if (!validGeometry(req.body.geometry)) {
        return reply.code(400).send({ error: 'bad_request', message: 'Geçersiz GeoJSON geometri (LineString/MultiLineString, [lon, lat]).' });
      }
      const input: FaultUpsert = {
        slug: req.body.slug,
        name: req.body.name,
        segmentType: req.body.segmentType ?? '',
        description: req.body.description ?? '',
        geometry: req.body.geometry,
        approximate: req.body.approximate ?? true,
        isZone: req.body.isZone ?? false,
        source: req.body.source,
        sourceUrl: req.body.sourceUrl ?? '',
        license: req.body.license ?? '',
        lastVerified: req.body.lastVerified ?? null,
      };
      const fault = await ctx.store.upsertFault(input);
      await ctx.store.logEvent({
        level: 'INFO',
        service: 'api',
        event: 'admin.fault_upserted',
        message: `Fay segmenti kaydedildi: ${fault.slug}`,
      });
      await ctx.cache.del('eq:fault');
      await ctx.cache.del('eq:faults:');
      return fault;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/faults/:id',
    {
      preHandler: auth.requireAdminMutation,
      schema: {
        tags: ['admin'],
        summary: 'Fay segmenti sil',
        params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const ok = await ctx.store.deleteFault(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'not_found', message: 'Fay segmenti bulunamadı.' });
      await ctx.cache.del('eq:fault');
      await ctx.cache.del('eq:faults:');
      return { ok: true };
    },
  );

  app.get<{ Querystring: { level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; limit?: number } }>(
    '/api/admin/system/events',
    {
      preHandler: auth.requireAdmin,
      schema: {
        tags: ['admin'],
        summary: 'Sistem olay günlüğü',
        querystring: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (req) => ctx.store.listEvents({ level: req.query.level, limit: req.query.limit ?? 100 }),
  );
}
