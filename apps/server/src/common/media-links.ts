import { Inject, Injectable } from '@nestjs/common';
import { MediaKind } from '@lytronix/validators';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';

/**
 * MED-08: where a ready item is read from: the file itself (a picture, or a video), and its small picture (an image's
 * thumbnail, a video's poster).
 */
export interface MediaUrls {
  main: string;
  thumbnail: string;
}

/** A ready image as every screen shows it: which item it is, and where it is read from. */
export interface ImageView {
  id: string;
  urls: MediaUrls;
}

/** PRD-11, STO-09: a ready video as a product shows it: the MP4, and its poster. */
export interface VideoView {
  id: string;
  urls: { video: string; poster: string };
}

/**
 * MED-01, MED-08: the stored names of a ready item -- under its shop's prefix, and named by its content's
 * fingerprint, so other content always gets another link. An image is a WebP and its thumbnail; a video is an MP4 and
 * its WebP poster (STO-09). The one place these names are made: the processing job writes them and every screen
 * reads them.
 */
export function mediaKeys(
  kind: MediaKind,
  tenantId: string,
  mediaId: string,
  hash: string,
): { main: string; thumbnail: string } {
  const stem = `tenants/${tenantId}/${mediaId}/${hash}`;
  return kind === MediaKind.Video
    ? { main: `${stem}.mp4`, thumbnail: `${stem}.poster.webp` }
    : { main: `${stem}.webp`, thumbnail: `${stem}.thumb.webp` };
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

  urls(kind: MediaKind, tenantId: string, mediaId: string, hash: string): MediaUrls {
    const keys = mediaKeys(kind, tenantId, mediaId, hash);
    return { main: this.url(keys.main), thumbnail: this.url(keys.thumbnail) };
  }

  image(tenantId: string, mediaId: string, hash: string): ImageView {
    return { id: mediaId, urls: this.urls(MediaKind.Image, tenantId, mediaId, hash) };
  }

  video(tenantId: string, mediaId: string, hash: string): VideoView {
    const urls = this.urls(MediaKind.Video, tenantId, mediaId, hash);
    return { id: mediaId, urls: { video: urls.main, poster: urls.thumbnail } };
  }
}
