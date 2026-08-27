import { Redis } from 'ioredis';

/**
 * CacheLayer — Redis in production, an in-process Map when REDIS_URL is not
 * configured. Used for hot API responses (latest list, stats) and as the
 * rate-limit backing store.
 */
export interface CacheLayer {
  readonly mode: 'redis' | 'memory';
  ok(): boolean;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(prefix: string): Promise<void>;
  wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
  /** Underlying ioredis client (rate-limit store); null in memory mode. */
  redisClient(): Redis | null;
  close(): Promise<void>;
}

export class MemoryCache implements CacheLayer {
  readonly mode = 'memory' as const;
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  ok(): boolean {
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (this.store.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.store) if (v.expiresAt < now) this.store.delete(k);
    }
  }

  async del(prefix: string): Promise<void> {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  redisClient(): Redis | null {
    return null;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

export class RedisCache implements CacheLayer {
  readonly mode = 'redis' as const;
  private client: Redis;
  private healthy = false;

  constructor(redisUrl: string, private prefix = 'ils:cache:') {
    this.client = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });
    this.client.on('ready', () => (this.healthy = true));
    this.client.on('error', () => (this.healthy = false));
    this.client.on('end', () => (this.healthy = false));
  }

  ok(): boolean {
    return this.healthy;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.prefix + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache is best-effort */
    }
  }

  async del(prefix: string): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.prefix}${prefix}*`);
      if (keys.length) await this.client.del(...keys);
    } catch {
      /* best-effort */
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  redisClient(): Redis | null {
    return this.client;
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

export function createCache(redisUrl: string | undefined): CacheLayer {
  return redisUrl ? new RedisCache(redisUrl) : new MemoryCache();
}
