import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ServerFieldProblemCode } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { MediaNotAttachable } from '../../../common/errors/media-refused';
import { MediaLinks, type ImageView } from '../../../common/media-links';
import type { CatalogueImageStore } from '../ports/catalogue-stores';
import { CATALOGUE_IMAGE_STORE } from '../tokens';

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
    const ready = await this.store.readyImages(tx, tenantId, wanted);
    return new Map(ready.map((row) => [row.id, this.links.image(tenantId, row.id, row.hash)]));
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
