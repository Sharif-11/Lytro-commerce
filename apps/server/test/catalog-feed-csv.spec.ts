import type { FeedAttributeRow, FeedImageRow, FeedVariantRow, Transaction } from '@lytronix/db';
import { ItemCondition, StockState } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { MediaLinks } from '../src/common/media-links';
import type { PublicCatalogueStore } from '../src/modules/public-api/ports/public-catalogue-store';
import { CatalogFeedCsv } from '../src/modules/public-api/services/catalog-feed-csv';

// FED-02, FED-03: how a feed row is filled -- photos, brand, colour and size -- from what the catalogue holds.
const SHOP = '0b9f6a3e-6f3c-4f7e-9d2a-1c2b3d4e5f60';
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const RED = '22222222-2222-4222-8222-222222222222';
const BLUE = '33333333-3333-4333-8333-333333333333';

function variant(variantId: string, stockState: StockState): FeedVariantRow {
  return {
    productId: PRODUCT,
    productSlug: 'সুতি-পাঞ্জাবি',
    name: 'Panjabi',
    description: null,
    condition: ItemCondition.New,
    variantId,
    price: '1500.00',
    stockState,
  };
}

function storeWith(
  images: FeedImageRow[],
  attributes: FeedAttributeRow[],
): Pick<
  PublicCatalogueStore,
  'run' | 'listFeedVariants' | 'listFeedImages' | 'listFeedAttributes'
> {
  return {
    run: <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
    listFeedVariants: () =>
      Promise.resolve([variant(RED, StockState.Low), variant(BLUE, StockState.Out)]),
    listFeedImages: () => Promise.resolve(images),
    listFeedAttributes: () => Promise.resolve(attributes),
  };
}

function csvOf(store: ReturnType<typeof storeWith>): Promise<string> {
  const feed = new CatalogFeedCsv(
    store as PublicCatalogueStore,
    new MediaLinks({ MEDIA_PUBLIC_BASE_URL: 'https://media.lytro.app' }),
    { feedUrl: (token) => token, shopOrigin: (slug) => `https://${slug}.lytro.app` },
  );
  return feed.build(SHOP, 'my-shop');
}

describe('a catalog feed row (FED-02, FED-03)', () => {
  it("takes the first photo, then up to ten more, and a variant's own colour before its product's", async () => {
    const images = Array.from({ length: 13 }, (_, index) => ({
      productId: PRODUCT,
      mediaId: `media-${String(index)}`,
      hash: `hash${String(index)}`,
    }));
    const csv = await csvOf(
      storeWith(images, [
        { productId: PRODUCT, variantId: null, name: 'brand', value: 'Aarong' },
        { productId: PRODUCT, variantId: null, name: 'colour', value: 'Mixed' },
        { productId: PRODUCT, variantId: RED, name: 'color', value: 'Red' },
        { productId: PRODUCT, variantId: RED, name: 'size', value: 'M' },
      ]),
    );
    const [header, red, blue] = csv.split('\n');
    expect(header).toBe(
      'id,item_group_id,title,description,availability,condition,price,link,image_link,additional_image_link,' +
        'brand,color,size',
    );
    const first = `https://media.lytro.app/tenants/${SHOP}/media-0/hash0.webp`;
    expect(red).toContain(`,${first},`);
    const more = Array.from(
      { length: 10 },
      (_, index) =>
        `https://media.lytro.app/tenants/${SHOP}/media-${String(index + 1)}/hash${String(index + 1)}.webp`,
    );
    expect(red).toContain(`"${more.join(',')}"`);
    expect(red).not.toContain('media-11');
    expect(red?.endsWith(',Aarong,Red,M')).toBe(true);
    expect(blue?.endsWith(',Aarong,Mixed,')).toBe(true);
    // FED-03: low is still in stock; out is out.
    expect(red).toContain(',in stock,');
    expect(blue).toContain(',out of stock,');
    // LND-06: the variant chosen in the product's landing link, the Bangla slug written for a URL.
    expect(red).toContain(
      `,https://my-shop.lytro.app/l/${encodeURIComponent('সুতি-পাঞ্জাবি')}?v=${RED},`,
    );
  });

  it('leaves the photo columns empty for a product with none', async () => {
    const csv = await csvOf(storeWith([], []));
    expect(csv.split('\n')[1]).toContain(',1500.00 BDT,');
    expect(csv.split('\n')[1]?.endsWith(`?v=${RED},,,,,`)).toBe(true);
  });
});
