import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  CLEAR_PAGE_TAGS_AT_ONCE,
  CLEAR_PAGE_TAGS_SCRIPT,
  PAGE_TAG_KEEP_MS,
  PAGE_TAG_TIMES_KEY,
} from '@lytronix/validators';
import type { Redis } from 'ioredis';
import type { PageCache } from '../ports/page-cache';
import { PAGE_CACHE_REDIS } from '../tokens';

/**
 * D9-33: clears the storefront's kept pages by tag in the page cache's Redis (PAGE_CACHE_REDIS_URL): each tag's change
 * time is written by Redis's own clock, and the storefront counts every page drawn before it gone. Without that Redis
 * (a developer's machine, the tests) there is nothing to clear.
 */
@Injectable()
export class RedisPageCache implements PageCache, OnApplicationShutdown {
  private readonly log = new Logger('PageCache');

  constructor(@Inject(PAGE_CACHE_REDIS) private readonly redis: Redis | null) {}

  async clearTags(tags: readonly string[]): Promise<void> {
    if (this.redis === null) return;
    try {
      for (let start = 0; start < tags.length; start += CLEAR_PAGE_TAGS_AT_ONCE) {
        await this.redis.eval(
          CLEAR_PAGE_TAGS_SCRIPT,
          1,
          PAGE_TAG_TIMES_KEY,
          PAGE_TAG_KEEP_MS,
          ...tags.slice(start, start + CLEAR_PAGE_TAGS_AT_ONCE),
        );
      }
    } catch (error) {
      // Cloudflare's purge still goes out; a copy left here lasts at most its lifetime (KNOWN-GAPS §151).
      this.log.warn(
        `kept pages not cleared: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect();
  }
}
