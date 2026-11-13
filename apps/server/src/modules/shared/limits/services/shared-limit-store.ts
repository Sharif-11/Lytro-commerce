import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { WindowVerdict } from '../../../../common/sliding-window';
import { DegradedMode } from '../../../degraded-mode/services/degraded-mode';
import type { LimitStore, SharedStoreState } from '../ports/limit-store';
import { LIMITS_REDIS } from '../tokens';
import { MemoryLimitStore } from './memory-limit-store';
import { RedisLimitStore } from './redis-limit-store';
import { RedisOutage } from './redis-outage';

// RED-05 (the owner's answer, 2026-11-13: "half each"): while Redis is down each API process allows half of every
// limit, so the two on a server together stay about the same.
const FALLBACK_SHARE = 2;
// How often a process that lost Redis tries it again, and how many failed tries make it an outage worth an email (a
// blip shorter than that only switches to memory and back).
const PING_EVERY_MS = 5_000;
const TRIES_BEFORE_OUTAGE = 3;
// A process just started gives Redis this long to connect before counting it as down (a deploy is not an outage).
const STARTUP_GRACE_MS = 15_000;

/**
 * D9-15, RED-02 to RED-05 (Slice 9.4): every rate limit's one store (LIMIT_STORE). The shared Redis when it answers;
 * this process's memory when there's no Redis at all (REDIS_URL unset: a developer's machine, the tests), at the full
 * limit; and the same memory while Redis is down, at half the limit. Its callers never know which. DAT-38 (Slice 9.5):
 * while degraded mode is on, every limit counted over a minute or less is divided by its factor first, here alone.
 */
@Injectable()
export class SharedLimitStore implements LimitStore, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SharedLimitStore.name);
  private readonly memory = new MemoryLimitStore();
  private readonly shared: RedisLimitStore | null;
  private answering = true;
  private reported = false;
  private failedTries = 0;
  private pinger: NodeJS.Timeout | null = null;
  private readonly startedAt = Date.now();

  constructor(
    @Inject(LIMITS_REDIS) private readonly redis: Redis | null,
    @Inject(RedisOutage) private readonly outage: Pick<RedisOutage, 'down' | 'up'>,
    @Optional()
    @Inject(DegradedMode)
    private readonly degraded?: Pick<DegradedMode, 'divisor'>,
  ) {
    this.shared = redis ? new RedisLimitStore(redis) : null;
  }

  onModuleInit(): void {
    this.memory.start();
  }

  onModuleDestroy(): void {
    this.memory.stop();
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    this.redis?.disconnect();
  }

  /** For the ready check (D9-21): whether the shared Redis answers. */
  state(): SharedStoreState {
    if (!this.shared) return 'not_configured';
    return this.answering ? 'up' : 'down';
  }

  take(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return this.ask('take', bucket, limit, windowMs, now);
  }

  peek(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return this.ask('peek', bucket, limit, windowMs, now);
  }

  private async ask(
    kind: 'take' | 'peek',
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
  ): Promise<WindowVerdict> {
    const allowed = await this.allowedNow(limit, windowMs);
    if (!this.shared) return this.memory[kind](bucket, allowed, windowMs, now);
    if (this.answering) {
      try {
        return await this.shared[kind](bucket, allowed, windowMs, now);
      } catch (error) {
        this.lost(error);
      }
    }
    const share = Math.max(1, Math.floor(allowed / FALLBACK_SHARE));
    return this.memory[kind](bucket, share, windowMs, now);
  }

  /** DAT-38 (Slice 9.5): the limit as it stands now: divided while degraded mode is on, if it counts over a minute. */
  private async allowedNow(limit: number, windowMs: number): Promise<number> {
    const divisor = this.degraded ? await this.degraded.divisor(windowMs) : 1;
    return divisor > 1 ? Math.max(1, Math.floor(limit / divisor)) : limit;
  }

  /** Redis failed a request: memory answers from now, and Redis is tried again every few seconds. */
  private lost(error: unknown): void {
    if (!this.answering) return;
    this.answering = false;
    this.failedTries = 0;
    this.log.warn(
      `Redis did not answer (${String(error)}): counting limits in memory, at half each`,
    );
    this.pinger = setInterval(() => void this.tryAgain(), PING_EVERY_MS);
    this.pinger.unref();
  }

  private async tryAgain(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.ping();
    } catch (error) {
      this.failedTries += 1;
      const settled = Date.now() - this.startedAt > STARTUP_GRACE_MS;
      if (!this.reported && settled && this.failedTries >= TRIES_BEFORE_OUTAGE) {
        this.reported = true;
        await this.outage.down(new Date(), String(error));
      }
      return;
    }
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    this.answering = true;
    this.log.log('Redis answers again: limits are counted together');
    // Every process that saw it back says so, not only the one that reported it down: the database ends the outage
    // once, and a server that never reported it sends nothing.
    this.reported = false;
    await this.outage.up(new Date());
  }
}
