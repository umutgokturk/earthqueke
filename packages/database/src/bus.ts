import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import type { BusEvent } from '@ils/types';

/** Commands the API can send to the ingestion engine (e.g. manual run). */
export interface IngestionCommand {
  type: 'command:ingestion:run';
  source?: string;
}

export type BusMessage = BusEvent | IngestionCommand;

/**
 * EventBus — connects the ingestion engine to the API's WebSocket hub.
 *  - RedisBus : pub/sub across processes (api + worker deployment)
 *  - LocalBus : in-process EventEmitter (embedded ingestion / memory mode)
 */
export interface EventBus {
  readonly mode: 'redis' | 'local';
  publish(message: BusMessage): Promise<void>;
  subscribe(handler: (message: BusMessage) => void): () => void;
  ok(): boolean;
  close(): Promise<void>;
}

export class LocalBus implements EventBus {
  readonly mode = 'local' as const;
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  ok(): boolean {
    return true;
  }

  async publish(message: BusMessage): Promise<void> {
    this.emitter.emit('message', message);
  }

  subscribe(handler: (message: BusMessage) => void): () => void {
    this.emitter.on('message', handler);
    return () => this.emitter.off('message', handler);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

const CHANNEL = 'ils:bus';

export class RedisBus implements EventBus {
  readonly mode = 'redis' as const;
  private pub: Redis;
  private sub: Redis;
  private emitter = new EventEmitter();
  private healthy = false;

  constructor(redisUrl: string) {
    const opts = {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    };
    this.pub = new Redis(redisUrl, opts);
    this.sub = new Redis(redisUrl, { ...opts, enableOfflineQueue: true });
    this.emitter.setMaxListeners(100);
    this.pub.on('ready', () => (this.healthy = true));
    this.pub.on('error', () => (this.healthy = false));
    this.sub.on('error', () => undefined);
    void this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_channel, raw) => {
      try {
        this.emitter.emit('message', JSON.parse(raw) as BusMessage);
      } catch {
        /* malformed message dropped */
      }
    });
  }

  ok(): boolean {
    return this.healthy;
  }

  async publish(message: BusMessage): Promise<void> {
    try {
      await this.pub.publish(CHANNEL, JSON.stringify(message));
    } catch {
      /* bus is best-effort; WS clients fall back to polling */
    }
  }

  subscribe(handler: (message: BusMessage) => void): () => void {
    this.emitter.on('message', handler);
    return () => this.emitter.off('message', handler);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
    await this.sub.quit().catch(() => this.sub.disconnect());
    await this.pub.quit().catch(() => this.pub.disconnect());
  }
}

export function createBus(redisUrl: string | undefined): EventBus {
  return redisUrl ? new RedisBus(redisUrl) : new LocalBus();
}
