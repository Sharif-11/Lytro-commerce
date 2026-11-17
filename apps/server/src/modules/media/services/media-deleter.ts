import { Inject, Injectable } from '@nestjs/common';
import type { MediaCache } from '../ports/media-cache';
import type { MediaStorage } from '../ports/media-storage';
import { MEDIA_CACHE, MEDIA_STORAGE } from '../tokens';
import type { MediaDeletePayload } from './media.service';

/**
 * MED-07, MED-09, LIF-19: the deletion job: removes the stored files of deleted media, or everything under a lapsed
 * shop's prefix. Only this job uses the store's deleting key. Removing what is already gone is not an error, so a
 * retried job finishes cleanly; a store or a cache that is away throws, so the job tries again.
 * D9-31: a lapsed shop's files are then dropped from Cloudflare's cache too -- after the store, so no request between
 * the two can keep a copy again.
 */
@Injectable()
export class MediaDeleter {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MEDIA_CACHE) private readonly cache: MediaCache,
  ) {}

  async delete(payload: MediaDeletePayload): Promise<void> {
    const keys =
      'prefix' in payload
        ? (await this.storage.listMedia(payload.prefix)).map((object) => object.key)
        : payload.keys;
    if (keys.length > 0) await this.storage.deleteMedia(keys);
    if ('prefix' in payload) await this.cache.purgeFolder(payload.prefix);
  }
}
