import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseConnector } from '@lytronix/db';
import { RequestQuota } from '../src/modules/public-api/services/request-quota';
import { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';

// One slow or lost database connection used to end the whole server: an 'error' event nobody listened for, or
// a timer's rejected promise nobody caught, either of which Node treats as fatal. Nothing here connects.
const NO_DATABASE = 'postgres://nobody@127.0.0.1:1/none';
const MINUTE_MS = 60_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a lost database connection does not end the server', () => {
  it('the job queue says what failed and on which queue', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { boss } = new PgBossClient({ DATABASE_URL: NO_DATABASE });
    const error = Object.assign(new Error('timeout exceeded'), { queue: 'domain_check_tick' });

    expect(() => boss.emit('error', error)).not.toThrow();

    expect(logged).toHaveBeenCalledWith('[job-queue] domain_check_tick: timeout exceeded');
  });

  it('the app pool says an idle connection was lost', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handle = new DatabaseConnector().connect(NO_DATABASE);
    const { $client: pool } = handle.db as unknown as {
      $client: { emit(event: string, error: Error): boolean };
    };

    expect(() => pool.emit('error', new Error('connection terminated'))).not.toThrow();

    expect(logged).toHaveBeenCalledWith('[database] idle connection lost: connection terminated');
    await handle.close();
  });

  it("the API request counts' timer reports a failed flush and keeps running", async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const slow = () => Promise.reject(new Error('timeout exceeded'));
    const quota = new RequestQuota(
      {} as never,
      {} as never,
      {} as never,
      { gracePercent: slow, fastSpendPercent: slow } as never,
    );

    quota.onModuleInit();
    for (let flush = 1; flush <= 2; flush += 1) {
      vi.advanceTimersByTime(MINUTE_MS);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(logged).toHaveBeenCalledTimes(flush);
    }

    quota.onModuleDestroy();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
