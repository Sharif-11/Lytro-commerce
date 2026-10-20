import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';

/** MED-08: where a ready image is read from: the picture and its thumbnail. */
export interface MediaUrls {
  main: string;
  thumbnail: string;
}

/** A ready image as every screen shows it: which item it is, and where it is read from. */
export interface ImageView {
  id: string;
  urls: MediaUrls;
}

/**
 * MED-01, MED-08: the stored names of a ready image -- under its shop's prefix, and named by its content's
 * fingerprint, so another picture always gets another link. The one place these names are made: the processing job
 * writes them and every screen reads them.
 */
export function imageKeys(
  tenantId: string,
  mediaId: string,
  hash: string,
): { main: string; thumbnail: string } {
  const stem = `tenants/${tenantId}/${mediaId}/${hash}`;
  return { main: `${stem}.webp`, thumbnail: `${stem}.thumb.webp` };
}

/** MED-01, MED-04: everything a shop stores is under this prefix. */
export function tenantPrefix(tenantId: string): string {
  return `tenants/${tenantId}/`;
}

/**
 * MED-08: the public link of a stored object -- the media bucket's public address now, the serving Worker's once it
 * stands (Slice 7). Without one set, links are relative to the site.
 */
@Injectable()
export class MediaLinks {
  private readonly base: string;

  constructor(@Inject(ENV) env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
    this.base = (env.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  }

  url(key: string): string {
    return `${this.base}/${key}`;
  }

  image(tenantId: string, mediaId: string, hash: string): ImageView {
    const keys = imageKeys(tenantId, mediaId, hash);
    return {
      id: mediaId,
      urls: { main: this.url(keys.main), thumbnail: this.url(keys.thumbnail) },
    };
  }
}
