import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { MINUTE_MS, SECOND_MS } from '../../../common/time';
import { CATALOGUE_CACHE_SETTINGS } from '../tokens';

/** CCH-05, CCH-04: the memory cache's hard size, and how long a shop's current version is read again after. */
export interface CatalogueCacheSettings {
  /** Bytes, by each answer's encoded size. */
  maxBytes: number;
  /** The largest one answer kept; a larger one (a big shop's feed) is built for every request instead. */
  maxEntryBytes: number;
  /** At least 1. */
  versionMs: number;
}

export const CATALOGUE_CACHE_DEFAULTS: CatalogueCacheSettings = {
  maxBytes: 100 * 1024 * 1024,
  maxEntryBytes: 10 * 1024 * 1024,
  versionMs: 2 * SECOND_MS,
};

// CCH-05: no answer is kept longer than this, whatever its browser lifetime.
const LONGEST_MS = 60 * SECOND_MS;
// CCH-13: how often the cache's figures are written to the log, until monitoring exists.
const REPORT_EVERY_MS = MINUTE_MS;
const BUILDS_KEPT = 10_000;

interface Entry {
  value: unknown;
  bytes: number;
}

type Build = () => Promise<unknown>;

/**
 * CCH-05, CCH-06, RED-06: the public catalogue's answers in this server's memory, least recently used first out, never
 * over the cap, each kept at most 60 seconds. Requests that miss together wait for one build. Keys carry the
 * catalogue versions, so an edit is never answered from an older entry. It sits after the public key's gate, so a
 * cached answer is still counted (RTE-04). Its hit ratio and slowest builds are logged each minute (CCH-13).
 */
@Injectable()
export class CatalogueCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CatalogueCache');
  private readonly entries: LRUCache<string, Entry, Build>;
  private hits = 0;
  private misses = 0;
  private builds: number[] = [];
  private reporter: NodeJS.Timeout | null = null;

  constructor(@Inject(CATALOGUE_CACHE_SETTINGS) settings: CatalogueCacheSettings) {
    this.entries = new LRUCache<string, Entry, Build>({
      maxSize: settings.maxBytes,
      maxEntrySize: settings.maxEntryBytes,
      sizeCalculation: (entry) => entry.bytes,
      ttl: LONGEST_MS,
      fetchMethod: async (_key, _stale, { context }) => {
        const started = performance.now();
        try {
          const value = await context();
          return { value, bytes: Math.max(Buffer.byteLength(JSON.stringify(value)), 1) };
        } finally {
          if (this.builds.length < BUILDS_KEPT) this.builds.push(performance.now() - started);
        }
      },
    });
  }

  onModuleInit(): void {
    this.reporter = setInterval(() => {
      this.report();
    }, REPORT_EVERY_MS);
    this.reporter.unref();
  }

  onModuleDestroy(): void {
    if (this.reporter) clearInterval(this.reporter);
  }

  /** The answer kept under `key`, or `build`'s, kept for `lifetimeMs` (60 seconds at most). */
  async get<T>(key: string, lifetimeMs: number, build: () => Promise<T>): Promise<T> {
    if (this.entries.has(key)) this.hits += 1;
    else this.misses += 1;
    const entry = await this.entries.fetch(key, {
      context: build,
      ttl: Math.min(lifetimeMs, LONGEST_MS),
    });
    if (!entry) throw new Error('the catalogue cache built nothing');
    return entry.value as T;
  }

  /** How many answers are kept, and their size in bytes. */
  size(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.entries.calculatedSize };
  }

  private report(): void {
    const requests = this.hits + this.misses;
    if (requests === 0) return;
    const sorted = [...this.builds].sort((a, b) => a - b);
    const slowest = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const { entries, bytes } = this.size();
    this.logger.log(
      `catalogue: ${String(requests)} requests, ${String(Math.round((this.hits * 100) / requests))}% from memory, ` +
        `${String(entries)} answers in ${(bytes / (1024 * 1024)).toFixed(1)} MB, 95% of builds within ` +
        `${slowest.toFixed(0)} ms`,
    );
    this.hits = 0;
    this.misses = 0;
    this.builds = [];
  }
}
