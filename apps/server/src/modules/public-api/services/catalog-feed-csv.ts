import { Inject, Injectable } from '@nestjs/common';
import type { FeedAttributeRow } from '@lytronix/db';
import { StockState } from '@lytronix/validators';
import { toCsv } from '../../../common/csv';
import { coverOf, MediaLinks, type ImageView } from '../../../common/media-links';
import type { PublicCatalogueStore } from '../ports/public-catalogue-store';
import { CATALOG_FEED_SETTINGS, PUBLIC_CATALOGUE_STORE } from '../tokens';
import type { CatalogFeedSettings } from './catalog-feed.service';

// FED-02: Meta's catalog columns, in order (the developer docs show them as the feed's first line).
export const CATALOG_FEED_COLUMNS = [
  'id',
  'item_group_id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'color',
  'size',
];
// FED-02: at most this many more photos after the first.
const MORE_IMAGES = 10;
// FED-02: the attributes the brand, colour and size columns come from, by name, the platform's or a shop's own.
const ATTRIBUTE_NAMES: Readonly<Record<'brand' | 'color' | 'size', readonly string[]>> = {
  brand: ['brand'],
  color: ['color', 'colour'],
  size: ['size'],
};
const WANTED = Object.values(ATTRIBUTE_NAMES).flat();

type Column = keyof typeof ATTRIBUTE_NAMES;

/** Each named column's values, by product (no variant) or by variant. */
function attributeValues(rows: readonly FeedAttributeRow[]): Map<string, Map<Column, string[]>> {
  const byOwner = new Map<string, Map<Column, string[]>>();
  for (const row of rows) {
    const column = (Object.keys(ATTRIBUTE_NAMES) as Column[]).find((name) =>
      ATTRIBUTE_NAMES[name].includes(row.name),
    );
    if (!column) continue;
    const owner = row.variantId ?? row.productId;
    const columns = byOwner.get(owner) ?? new Map<Column, string[]>();
    columns.set(column, [...(columns.get(column) ?? []), row.value]);
    byOwner.set(owner, columns);
  }
  return byOwner;
}

/**
 * FED-01 to FED-03: a shop's Meta catalog feed, a CSV with one row per variant on sale of each active product, grouped
 * by product: the variant's price and availability, the product's link with the variant chosen (LND-06), its photos,
 * and its brand, colour and size -- a variant's own value before its product's.
 */
@Injectable()
export class CatalogFeedCsv {
  constructor(
    @Inject(PUBLIC_CATALOGUE_STORE) private readonly store: PublicCatalogueStore,
    @Inject(MediaLinks) private readonly links: MediaLinks,
    @Inject(CATALOG_FEED_SETTINGS) private readonly settings: CatalogFeedSettings,
  ) {}

  build(tenantId: string, shopSlug: string, ownDomain: string | null): Promise<string> {
    return this.store.run(async (tx) => {
      const variants = await this.store.listFeedVariants(tx, tenantId);
      const images = new Map<string, { view: ImageView; designId: string | null }[]>();
      for (const row of await this.store.listFeedImages(tx, tenantId)) {
        const view = this.links.image(tenantId, row.mediaId, row.hash);
        images.set(row.productId, [
          ...(images.get(row.productId) ?? []),
          { view, designId: row.designId },
        ]);
      }
      // STO-09: a product with no photo shows its video's poster, so Meta never gets an item without a picture.
      const videos = new Map(
        (await this.store.listFeedVideos(tx, tenantId)).map((row) => [
          row.productId,
          this.links.video(tenantId, row.mediaId, row.hash),
        ]),
      );
      const values = attributeValues(await this.store.listFeedAttributes(tx, tenantId, WANTED));
      const origin = this.settings.shopOrigin(shopSlug, ownDomain);
      const valueOf = (column: Column, productId: string, variantId: string): string =>
        (values.get(variantId)?.get(column) ?? values.get(productId)?.get(column) ?? []).join('/');
      return toCsv(
        variants.map((row) => {
          // ATR-19 (PD-23): a design's variant leads with its design's photos, its cover first, then the plain ones.
          const all = images.get(row.productId) ?? [];
          const photos = (
            row.designId === null
              ? all
              : [
                  ...all.filter((photo) => photo.designId === row.designId),
                  ...all.filter((photo) => photo.designId === null),
                ]
          ).map((photo) => photo.view);
          return {
            id: row.variantId,
            item_group_id: row.productId,
            title: row.name,
            // Meta requires a description: the product's own, kept as written, else its name.
            description:
              row.description !== null && row.description.trim() !== ''
                ? row.description
                : row.name,
            availability: row.stockState === StockState.Out ? 'out of stock' : 'in stock',
            condition: row.condition,
            price: `${row.price} BDT`,
            // The owner, 2026-11-25: a product's links name its ID, never its slug (a Bangla name made a very long link).
            link: `${origin}/l/${row.productId}?v=${row.variantId}`,
            image_link: coverOf(photos, videos.get(row.productId) ?? null)?.urls.main ?? '',
            additional_image_link: photos
              .slice(1, 1 + MORE_IMAGES)
              .map((photo) => photo.urls.main)
              .join(','),
            brand: valueOf('brand', row.productId, row.variantId),
            color: valueOf('color', row.productId, row.variantId),
            size: valueOf('size', row.productId, row.variantId),
          };
        }),
        CATALOG_FEED_COLUMNS,
        // Meta reads it, not a spreadsheet: a description starting "- 100% cotton" stays as written.
        'machine',
      );
    });
  }
}
