import { Inject, Injectable } from '@nestjs/common';
import type { FeedAttributeRow } from '@lytronix/db';
import { StockState } from '@lytronix/validators';
import { toCsv } from '../../../common/csv';
import { MediaLinks } from '../../../common/media-links';
import type { PublicCatalogueStore } from '../ports/public-catalogue-store';
import { CATALOG_FEED_SETTINGS, PUBLIC_CATALOGUE_STORE } from '../tokens';
import type { CatalogFeedSettings } from './catalog-feed.service';

// FED-02: Meta's catalog columns, in order.
const COLUMNS = [
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
      const images = new Map<string, string[]>();
      for (const row of await this.store.listFeedImages(tx, tenantId)) {
        const url = this.links.image(tenantId, row.mediaId, row.hash).urls.main;
        images.set(row.productId, [...(images.get(row.productId) ?? []), url]);
      }
      const values = attributeValues(await this.store.listFeedAttributes(tx, tenantId, WANTED));
      const origin = this.settings.shopOrigin(shopSlug, ownDomain);
      const valueOf = (column: Column, productId: string, variantId: string): string =>
        (values.get(variantId)?.get(column) ?? values.get(productId)?.get(column) ?? []).join('/');
      return toCsv(
        variants.map((row) => {
          const photos = images.get(row.productId) ?? [];
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
            link: `${origin}/l/${encodeURIComponent(row.productSlug)}?v=${row.variantId}`,
            image_link: photos[0] ?? '',
            additional_image_link: photos.slice(1, 1 + MORE_IMAGES).join(','),
            brand: valueOf('brand', row.productId, row.variantId),
            color: valueOf('color', row.productId, row.variantId),
            size: valueOf('size', row.productId, row.variantId),
          };
        }),
        COLUMNS,
      );
    });
  }
}
