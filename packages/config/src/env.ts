import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const optionalBool = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v.trim() === '') return undefined;
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  });

const numberWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v !== undefined && v.trim() !== '' ? Number(v) : NaN;
      return Number.isFinite(n) ? n : def;
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: optionalString,
  REDIS_URL: optionalString,

  API_PORT: numberWithDefault(4000),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  EMBEDDED_INGESTION: optionalBool,

  INGESTION_INTERVAL_MS: numberWithDefault(20_000),
  INGEST_MIN_LAT: numberWithDefault(39.8),
  INGEST_MAX_LAT: numberWithDefault(41.6),
  INGEST_MIN_LON: numberWithDefault(26.0),
  INGEST_MAX_LON: numberWithDefault(30.5),

  AFAD_API_URL: z.string().default('https://deprem.afad.gov.tr/apiv2'),
  KANDILLI_API_URL: z.string().default('https://www.koeri.boun.edu.tr/scripts/lst0.asp'),
  MOCK_PROVIDER_ENABLED: optionalBool,

  DEDUPE_TIME_SECONDS: numberWithDefault(90),
  DEDUPE_DISTANCE_KM: numberWithDefault(15),
  DEDUPE_MAGNITUDE_DELTA: numberWithDefault(0.7),

  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: optionalString,
  ADMIN_PASSWORD_HASH: optionalString,
  ADMIN_JWT_SECRET: optionalString,

  INTERNAL_API_TOKEN: optionalString,

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  isProduction: boolean;
  isTest: boolean;
  /** Whether ingestion should run inside the API process. */
  embeddedIngestion: boolean;
  /** Whether the mock provider may be used at all. */
  mockProviderEnabled: boolean;
};

/**
 * Parse and validate process.env once, centrally.
 * Rules:
 *  - memory store (no DATABASE_URL) forces embedded ingestion, because the
 *    in-memory store cannot be shared between processes;
 *  - the mock provider is hard-disabled in production, whatever the env says.
 */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.parse(raw);
  const isProduction = parsed.NODE_ENV === 'production';
  const isTest = parsed.NODE_ENV === 'test';
  const memoryMode = !parsed.DATABASE_URL;
  const embeddedIngestion = memoryMode ? true : parsed.EMBEDDED_INGESTION ?? false;
  const mockProviderEnabled = isProduction ? false : parsed.MOCK_PROVIDER_ENABLED ?? !isProduction;

  if (isProduction) {
    if (!parsed.ADMIN_JWT_SECRET) {
      throw new Error('ADMIN_JWT_SECRET is required in production');
    }
    if (!parsed.ADMIN_PASSWORD_HASH && !parsed.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD_HASH (preferred) or ADMIN_PASSWORD is required in production');
    }
  }

  return { ...parsed, isProduction, isTest, embeddedIngestion, mockProviderEnabled };
}
