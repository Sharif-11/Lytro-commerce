import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { MediaKind, ServerFieldProblemCode } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { MediaNotAttachable } from '../../../common/errors/media-refused';
import { MediaLinks, type ImageView, type VideoView } from '../../../common/media-links';
import type { CatalogueImageStore } from '../ports/catalogue-stores';
import { CATALOGUE_IMAGE_STORE } from '../tokens';
import type { ProductImageView, ProductVideoView } from '../types/catalogue';

/** MED-03: the image named in `field` is not a ready image of the shop's; any other failure passes on as it is. */
export function refuseUnattachable(error: unknown, field: string): never {
  if (error instanceof MediaNotAttachable) {
    throw new FieldsError([
      { field, problem: ServerFieldProblemCode.NotFound, messageKey: 'MediaNotAttachable' },
    ]);
  }
  throw error;
}

/**
 * MED-08, PRD-11: the images a catalogue screen shows -- a product's photos, a category's banner, a swatch, an image
 * size chart, the logo -- each with its links. An id that is not a ready image of the shop's shows nothing.
 */
@Injectable()
export class CatalogueImages {
  constructor(
    @Inject(CATALOGUE_IMAGE_STORE) private readonly store: CatalogueImageStore,
    @Inject(MediaLinks) private readonly links: MediaLinks,
  ) {}

  /** These images, by id; null and undefined ids are skipped. */
  async viewsOf(
    tx: Transaction,
    tenantId: string,
    ids: readonly (string | null | undefined)[],
  ): Promise<Map<string, ImageView>> {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (wanted.length === 0) return new Map();
    const ready = await this.store.readyMedia(tx, tenantId, wanted, MediaKind.Image);
    return new Map(ready.map((row) => [row.id, this.links.image(tenantId, row.id, row.hash)]));
  }

  /** PRD-11: a product's video, when it names a ready one. */
  async videoOf(tx: Transaction, tenantId: string, id: string | null): Promise<VideoView | null> {
    if (id === null) return null;
    const [ready] = await this.store.readyMedia(tx, tenantId, [id], MediaKind.Video);
    return ready ? this.links.video(tenantId, ready.id, ready.hash) : null;
  }

  /**
   * PRD-11, STO-01, STO-09: a product's photos in the order shown and its video, as its editor shows them: each with
   * the bytes it stores, and the video's length.
   */
  async ofProduct(
    tx: Transaction,
    tenantId: string,
    productId: string,
    videoId: string | null,
  ): Promise<{ images: ProductImageView[]; video: ProductVideoView | null }> {
    const images = (await this.ofProducts(tx, tenantId, [productId])).get(productId) ?? [];
    const video = await this.videoOf(tx, tenantId, videoId);
    const ids = [...images.map((image) => image.id), ...(video ? [video.id] : [])];
    const sizes = new Map(
      (await this.store.sizesOf(tx, tenantId, ids)).map((size) => [size.id, size]),
    );
    return {
      images: images.map((image) => ({ ...image, bytes: sizes.get(image.id)?.bytes ?? 0 })),
      video: video && {
        ...video,
        bytes: sizes.get(video.id)?.bytes ?? 0,
        durationMs: sizes.get(video.id)?.durationMs ?? null,
      },
    };
  }

  /** PRD-11: each product's photos, in the order shown. */
  async ofProducts(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, ImageView[]>> {
    const rows = await this.store.listProductImages(tx, tenantId, productIds);
    const views = await this.viewsOf(
      tx,
      tenantId,
      rows.map((row) => row.mediaId),
    );
    const byProduct = new Map<string, ImageView[]>();
    for (const row of rows) {
      const image = views.get(row.mediaId);
      if (!image) continue;
      byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), image]);
    }
    return byProduct;
  }
}
