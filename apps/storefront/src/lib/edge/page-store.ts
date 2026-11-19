import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { PAGE_TAG_TIMES_KEY } from '@lytronix/validators/edge';
import { Redis } from 'ioredis';

const gzipped = promisify(gzip);
const gunzipped = promisify(gunzip);

/** A drawn page as the storefront's Redis keeps it (D9-33). */
export interface KeptPage {
  status: number;
  headers: [string, string][];
  html: string;
  /** The tags the server's purges name it by (D9-32). */
  tags: string[];
  /** When its drawing started, and until when it is fresh: milliseconds by Redis's own clock, which the purges keep too. */
  drawnAt: number;
  freshUntil: number;
}

/** What Redis holds for a page: a fresh copy, nothing, or no answer at all. `now` is Redis's clock. */
export type PageLookup =
  | { kind: 'kept'; page: KeptPage; now: number }
  | { kind: 'missing'; now: number }
  | { kind: 'unavailable' };

/** The turn to draw a page: taken here, held by another process, or Redis didn't answer. */
export type DrawTurn = 'taken' | 'held' | 'unavailable';

/** D9-33: the storefront's Redis copies of drawn pages, so its callers never know Redis's commands. */
export interface PageStore {
  find(key: string): Promise<PageLookup>;
  /** Keeps the page while it is fresh, unless a tag of it changed after its drawing started. True when it was kept. */
  keep(key: string, page: KeptPage): Promise<boolean>;
  /** One process draws a page at a time: the turn lapses after `ms`, or when its holder lets it go. */
  takeTurn(key: string, ms: number): Promise<DrawTurn>;
  endTurn(key: string): Promise<void>;
}

// Redis's clock, in milliseconds, in each script: every time a page and a purge are compared by is one clock's.
const NOW = `local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)`;

// True when any of the page's tags changed at or after its drawing started (the server's purge wrote that tag's time).
const CHANGED = `local function changed(page)
  if #page.tags == 0 then return false end
  local times = redis.call('HMGET', KEYS[2], unpack(page.tags))
  for i = 1, #times do
    if times[i] and tonumber(times[i]) >= page.drawnAt then return true end
  end
  return false
end`;

// KEYS: the page, the tags' times. A copy past its time or a tag's change is gone, and deleted on the way.
const FIND_SCRIPT = `${NOW}
${CHANGED}
local meta = redis.call('HGET', KEYS[1], 'm')
if not meta then return {now} end
local page = cjson.decode(meta)
if page.freshUntil <= now or changed(page) then
  redis.call('DEL', KEYS[1])
  return {now}
end
return {now, meta, redis.call('HGET', KEYS[1], 'b')}`;

// KEYS: the page, the tags' times. ARGV: what the page is (JSON, without its HTML), its HTML (gzipped). Kept until it
// is no longer fresh, and not at all once a tag of it changed after its drawing started: it may show the old.
const KEEP_SCRIPT = `${NOW}
${CHANGED}
local page = cjson.decode(ARGV[1])
local ttl = math.floor(page.freshUntil - now)
if ttl <= 0 or changed(page) then return 0 end
redis.call('HSET', KEYS[1], 'm', ARGV[1], 'b', ARGV[2])
redis.call('PEXPIRE', KEYS[1], ttl)
return 1`;

interface PageCommands {
  pageFindBuffer(page: string, tags: string): Promise<[number, Buffer?, Buffer?]>;
  pageKeep(page: string, tags: string, meta: string, html: Buffer): Promise<number>;
}

// After Redis fails to answer FAILURES_BEFORE_REST times in a row, it's left alone this long, so pages don't each wait
// on it in turn. One failure alone doesn't: on a storefront busy drawing pages, a command's timer can fire before its
// answer, already arrived, is read. Staging's live run at the capacity model's peak (2026-11-19) drew 280 of 607 pages a
// minute "without Redis" while Redis itself sat at 1% CPU: each late answer rested the cache for 5 seconds and sent
// every page in them to be drawn, the very work that made the next answer late. A Redis that is down is skipped at once
// anyway (connected(), below), so the rest is only for one that is connected but stopped answering.
const REST_AFTER_FAILURE_MS = 5_000;
const FAILURES_BEFORE_REST = 5;
// A new process's first pages wait this long at most for its first connection, rather than all being drawn.
const FIRST_CONNECTION_WAIT_MS = 1_000;

/**
 * D9-33: the page cache in its own Redis (deploy/compose.yml's page-cache: eviction among keys that expire, so a full
 * cache drops pages, never the tags' times). A page is a hash of what it is and its gzipped HTML, expiring when it is no
 * longer fresh. Nothing here ever throws: a Redis that doesn't answer is `unavailable`, and the storefront draws pages
 * as it did without it.
 */
export class RedisPageStore implements PageStore {
  private readonly redis: Redis & PageCommands;
  private restingUntil = 0;
  private failuresInARow = 0;
  private readonly firstConnection: Promise<void>;
  private waitedForFirst = false;

  constructor(
    redis: Redis,
    private readonly clock: () => number = Date.now,
  ) {
    redis.defineCommand('pageFind', { numberOfKeys: 2, lua: FIND_SCRIPT });
    redis.defineCommand('pageKeep', { numberOfKeys: 2, lua: KEEP_SCRIPT });
    this.redis = redis as Redis & PageCommands;
    this.firstConnection = new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        redis.off('ready', done);
        resolve();
      };
      const timer = setTimeout(done, FIRST_CONNECTION_WAIT_MS);
      timer.unref();
      redis.on('ready', done);
    });
  }

  find(key: string): Promise<PageLookup> {
    return this.attempt<PageLookup>({ kind: 'unavailable' }, async () => {
      const [now, meta, html] = await this.redis.pageFindBuffer(key, PAGE_TAG_TIMES_KEY);
      if (meta === undefined || html === undefined) return { kind: 'missing', now };
      const what = JSON.parse(meta.toString('utf8')) as Omit<KeptPage, 'html'>;
      const page = { ...what, html: (await gunzipped(html)).toString('utf8') };
      return { kind: 'kept', page, now };
    });
  }

  keep(key: string, page: KeptPage): Promise<boolean> {
    const { html, ...what } = page;
    return this.attempt(false, async () => {
      const body = await gzipped(Buffer.from(html, 'utf8'));
      return (await this.redis.pageKeep(key, PAGE_TAG_TIMES_KEY, JSON.stringify(what), body)) === 1;
    });
  }

  takeTurn(key: string, ms: number): Promise<DrawTurn> {
    return this.attempt<DrawTurn>('unavailable', async () =>
      (await this.redis.set(RedisPageStore.turnOf(key), '1', 'PX', ms, 'NX')) === 'OK'
        ? 'taken'
        : 'held',
    );
  }

  endTurn(key: string): Promise<void> {
    return this.attempt(undefined, async () => {
      await this.redis.del(RedisPageStore.turnOf(key));
    });
  }

  private static turnOf(key: string): string {
    return `${key}:turn`;
  }

  /** Whether Redis is connected: only a new process's first pages wait for that, and only a moment. */
  private async connected(): Promise<boolean> {
    if (this.redis.status !== 'ready' && !this.waitedForFirst) {
      await this.firstConnection;
      this.waitedForFirst = true;
    }
    return this.redis.status === 'ready';
  }

  private async attempt<T>(otherwise: T, work: () => Promise<T>): Promise<T> {
    if (this.clock() < this.restingUntil || !(await this.connected())) return otherwise;
    try {
      const done = await work();
      this.failuresInARow = 0;
      return done;
    } catch {
      this.failuresInARow += 1;
      if (this.failuresInARow >= FAILURES_BEFORE_REST) {
        this.failuresInARow = 0;
        this.restingUntil = this.clock() + REST_AFTER_FAILURE_MS;
      }
      return otherwise;
    }
  }
}

/**
 * The page cache's Redis. A page waits on it a second at most: a command that gets no answer by then fails, and nothing
 * queues while it's disconnected. It keeps reconnecting in the background, and says why at most once a minute. The
 * second is a busy storefront's, not Redis's (it answers in a millisecond): when it's busy, drawing the page instead
 * takes seconds, so the copy is worth the wait (it was a quarter of a second until staging's live run, 2026-11-19).
 */
export function connectPageCache(url: string): Redis {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    commandTimeout: 1_000,
    connectTimeout: 2_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  let lastSaid = 0;
  client.on('error', (error: Error) => {
    if (Date.now() - lastSaid > 60_000) {
      lastSaid = Date.now();
      console.warn(`page cache: ${error.message}`);
    }
  });
  return client;
}
