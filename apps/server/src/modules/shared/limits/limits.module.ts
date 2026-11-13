import { Global, Logger, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { DrizzleLimitsDatabase } from '../../../database/adapters/limits.adapter';
import { MailModule } from '../mail/mail.module';
import { ExactLimits } from './services/exact-limits';
import { Leases } from './services/leases';
import { RedisOutage } from './services/redis-outage';
import { SharedLimitStore } from './services/shared-limit-store';
import { LIMIT_STORE, LIMITS_DATABASE, LIMITS_REDIS } from './tokens';

/**
 * The shared Redis, or null where REDIS_URL isn't set. A request never waits on it: a command that gets no answer in a
 * quarter of a second fails, and nothing queues while it's disconnected (SharedLimitStore then counts in memory). It
 * keeps reconnecting in the background.
 */
function redisFor(env: Env): Redis | null {
  if (!env.REDIS_URL) return null;
  const log = new Logger('Redis');
  const client = new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    commandTimeout: 250,
    connectTimeout: 2_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  let lastLogged = 0;
  client.on('error', (error: Error) => {
    // Logged at most once a minute: a down Redis reports the same error on every reconnect.
    if (Date.now() - lastLogged > 60_000) {
      lastLogged = Date.now();
      log.warn(error.message);
    }
  });
  return client;
}

/**
 * D9-15, RED-01 to RED-05, RED-11 (Slice 9.4): every rate limit's one store (Redis, or this process's memory), the
 * exact limits in PostgreSQL, and leases, for every module. Global, like the database.
 */
@Global()
@Module({
  imports: [MailModule],
  providers: [
    { provide: LIMITS_REDIS, inject: [ENV], useFactory: (env: Env) => redisFor(env) },
    { provide: LIMITS_DATABASE, useClass: DrizzleLimitsDatabase },
    RedisOutage,
    SharedLimitStore,
    { provide: LIMIT_STORE, useExisting: SharedLimitStore },
    ExactLimits,
    Leases,
  ],
  exports: [LIMIT_STORE, SharedLimitStore, ExactLimits, Leases, LIMITS_REDIS],
})
export class LimitsModule {}
