import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { WindowVerdict } from '../../../../common/sliding-window';
import type { LimitStore } from '../ports/limit-store';

// The sliding window as one atomic step in Redis (RED-03): a bucket is a sorted set of the times it let a request
// through. Times at or before `now - window` leave; if what's left is under the limit, this request's time goes in
// (when taking) and the key expires a window after its newest. Returns {allowed, remaining, resetMs}, exactly as the
// in-memory window does (common/sliding-window.ts).
const WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = 0
if first[2] then reset = math.max(tonumber(first[2]) + window - now, 0) end
if count >= limit then return {0, 0, reset} end
if ARGV[5] == '1' then
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, window)
  count = count + 1
  if not first[2] then reset = window end
end
return {1, limit - count, reset}
`;

/**
 * D9-15, RED-02, RED-03 (Slice 9.4): the limit store in the shared Redis, so every API copy and every server count a
 * bucket together. Every key it writes expires (RED-01's eviction touches only keys with an expiry).
 */
export class RedisLimitStore implements LimitStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'lytro:limit:',
  ) {}

  take(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return this.window(bucket, limit, windowMs, now, true);
  }

  peek(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return this.window(bucket, limit, windowMs, now, false);
  }

  private async window(
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    take: boolean,
  ): Promise<WindowVerdict> {
    const at = now.getTime();
    const member = `${String(at)}:${randomBytes(6).toString('hex')}`;
    const reply = (await this.redis.eval(
      WINDOW_SCRIPT,
      1,
      `${this.prefix}${bucket}`,
      String(at),
      String(windowMs),
      String(limit),
      member,
      take ? '1' : '0',
    )) as [number, number, number];
    return { allowed: reply[0] === 1, remaining: reply[1], resetMs: reply[2] };
  }
}
