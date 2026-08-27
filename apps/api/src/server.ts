import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import type { AppEnv } from '@ils/config';
import { APP_NAME, APP_TAGLINE } from '@ils/config';
import type { CacheLayer, DataStore, EventBus } from '@ils/database';
import type { IngestionEngine } from '@ils/worker';
import { ADMIN_COOKIE, createAdminAuth } from './auth';
import type { ApiContext } from './context';
import { registerActivityRoutes } from './routes/activity';
import { registerAdminRoutes } from './routes/admin';
import { registerEarthquakeRoutes } from './routes/earthquakes';
import { registerFaultRoutes } from './routes/faults';
import { registerRegionRoutes } from './routes/regions';
import { registerSystemRoutes } from './routes/system';
import { registerWsHub, type WsHub } from './ws';

export const API_VERSION = '1.0.0';

export interface BuildServerOptions {
  env: AppEnv;
  store: DataStore;
  cache: CacheLayer;
  bus: EventBus;
  engine?: IngestionEngine | null;
  /** Fastify logger option (false in tests). */
  logger?: boolean | object;
}

export interface BuiltServer {
  app: FastifyInstance;
  wsHub: WsHub;
  ctx: ApiContext;
}

export async function buildServer(options: BuildServerOptions): Promise<BuiltServer> {
  const { env, store, cache, bus } = options;

  const app = Fastify({
    logger:
      options.logger !== undefined
        ? options.logger
        : { level: env.LOG_LEVEL, base: { service: 'api' } },
    trustProxy: true,
    disableRequestLogging: env.isProduction,
  });

  const ctx: ApiContext = {
    env,
    store,
    cache,
    bus,
    engine: options.engine ?? null,
    startedAt: Date.now(),
    version: API_VERSION,
    wsClientCount: () => 0,
  };

  // ── security & platform plugins ──────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // API serves JSON + the bundled Swagger UI
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.ADMIN_JWT_SECRET ?? 'ils-development-only-secret',
    cookie: { cookieName: ADMIN_COOKIE, signed: false },
  });
  const redis = cache.redisClient();
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
  });

  // ── OpenAPI docs ─────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: `${APP_NAME} API`,
        description:
          `${APP_TAGLINE}\n\n` +
          'Bu platform resmî bir deprem ölçüm kurumu değildir; veriler ilgili sağlayıcıların ' +
          '(AFAD, Kandilli Rasathanesi) yayınladığı bilgilerden alınır ve platform deprem tahmini yapmaz.',
        version: API_VERSION,
      },
      tags: [
        { name: 'earthquakes', description: 'Deprem verileri, istatistikler, dışa aktarım' },
        { name: 'faults', description: 'Fay segmentleri ve segment istatistikleri' },
        { name: 'regions', description: 'Bölgeler ve ilçe analizleri' },
        { name: 'activity', description: 'Gözlemsel aktivite indeksi (tahmin değildir)' },
        { name: 'system', description: 'Sistem ve kaynak durumu' },
        { name: 'admin', description: 'Yönetim uçları (oturum gerekli)' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // ── WebSocket hub ────────────────────────────────────────
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  const wsHub = registerWsHub(app, bus, env);
  ctx.wsClientCount = () => wsHub.clientCount();

  // ── routes ───────────────────────────────────────────────
  const auth = createAdminAuth(app, env);
  registerEarthquakeRoutes(app, ctx);
  registerFaultRoutes(app, ctx);
  registerRegionRoutes(app, ctx);
  registerActivityRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerAdminRoutes(app, ctx, auth);

  // ── uniform errors ───────────────────────────────────────
  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({ error: 'not_found', message: `Kayıt bulunamadı: ${req.method} ${req.url}` });
  });
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err, url: req.url }, 'api.unhandled_error');
    }
    void reply.code(status).send({
      error: status === 429 ? 'rate_limited' : status >= 500 ? 'internal_error' : 'bad_request',
      message:
        status >= 500 && env.isProduction
          ? 'Beklenmeyen bir hata oluştu.'
          : err.message,
    });
  });

  app.addHook('onClose', async () => {
    wsHub.close();
  });

  return { app, wsHub, ctx };
}
