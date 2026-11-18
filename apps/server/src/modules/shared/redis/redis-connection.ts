import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * A Redis connection a request never waits on: a command that gets no answer in a quarter of a second fails, and
 * nothing queues while it's disconnected (its callers then do without it). It keeps reconnecting in the background, and
 * says why at most once a minute, since a down Redis reports the same error on every try. `name` names it in the log.
 */
export function connectRedis(url: string, name: string): Redis {
  const log = new Logger(name);
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    commandTimeout: 250,
    connectTimeout: 2_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  let lastLogged = 0;
  client.on('error', (error: Error) => {
    if (Date.now() - lastLogged > 60_000) {
      lastLogged = Date.now();
      log.warn(error.message);
    }
  });
  return client;
}
