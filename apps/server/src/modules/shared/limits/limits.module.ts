import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { DrizzleLimitsDatabase } from '../../../database/adapters/limits.adapter';
import { MailModule } from '../mail/mail.module';
import { connectRedis } from '../redis/redis-connection';
import { ExactLimits } from './services/exact-limits';
import { Leases } from './services/leases';
import { RedisOutage } from './services/redis-outage';
import { SharedLimitStore } from './services/shared-limit-store';
import { LIMIT_STORE, LIMITS_DATABASE, LIMITS_REDIS } from './tokens';

/**
 * The shared Redis, or null where REDIS_URL isn't set. A request never waits on it (connectRedis): while it doesn't
 * answer, SharedLimitStore counts in memory.
 */
function redisFor(env: Env): Redis | null {
  return env.REDIS_URL ? connectRedis(env.REDIS_URL, 'Redis') : null;
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
