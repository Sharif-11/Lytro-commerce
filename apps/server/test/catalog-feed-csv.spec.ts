import type {
  FeedAttributeRow,
  FeedImageRow,
  FeedVariantRow,
  FeedVideoRow,
  Transaction,
} from '@lytronix/db';
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

function variant(
  variantId: string,
  stockState: StockState,
  designId: string | null = null,
): FeedVariantRow {
  return {
    productId: PRODUCT,
    productSlug: 'সুতি-পাঞ্জাবি',
    name: 'Panjabi',
    description: null,
    condition: ItemCondition.New,
    variantId,
    price: '1500.00',
    stockState,
    designId,
  };
}

function storeWith(
  images: FeedImageRow[],
  attributes: FeedAttributeRow[],
  variants: FeedVariantRow[] = [variant(RED, StockState.Low), variant(BLUE, StockState.Out)],
  videos: FeedVideoRow[] = [],
): Pick<
  PublicCatalogueStore,
  'run' | 'listFeedVariants' | 'listFeedImages' | 'listFeedVideos' | 'listFeedAttributes'
> {
  return {
    run: <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
    listFeedVariants: () => Promise.resolve(variants),
    listFeedImages: () => Promise.resolve(images),
    listFeedVideos: () => Promise.resolve(videos),
    listFeedAttributes: () => Promise.resolve(attributes),
  };
}

function csvOf(store: ReturnType<typeof storeWith>): Promise<string> {
  const feed = new CatalogFeedCsv(
    store as PublicCatalogueStore,
    new MediaLinks({ MEDIA_PUBLIC_BASE_URL: 'https://media.lytro.app' }),
    {
      feedUrl: (token) => token,
      shopOrigin: (slug, ownDomain) => `https://${ownDomain ?? `${slug}.lytro.app`}`,
    },
  );
  return feed.build(SHOP, 'my-shop', null);
}

describe('a catalog feed row (FED-02, FED-03)', () => {
  it("takes the first photo, then up to ten more, and a variant's own colour before its product's", async () => {
    const images = Array.from({ length: 13 }, (_, index) => ({
      productId: PRODUCT,
      mediaId: `media-${String(index)}`,
      hash: `hash${String(index)}`,
      designId: null,
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
    // LND-06: the variant chosen in the product's landing link, which names the product by its ID, never its slug
    // (the owner, 2026-11-25: a Bangla slug made a very long link).
    expect(red).toContain(`,https://my-shop.lytro.app/l/${PRODUCT}?v=${RED},`);
    expect(red).not.toContain(encodeURIComponent('সুতি-পাঞ্জাবি'));
  });

  it("leads a design's variant with its design's photos, cover first, then the plain ones (PD-23)", async () => {
    const STRIPED = '44444444-4444-4444-8444-444444444444';
    const BLACK = '55555555-5555-4555-8555-555555555555';
    const photo = (name: string, designId: string | null): FeedImageRow => ({
      productId: PRODUCT,
      mediaId: name,
      hash: 'h',
      designId,
    });
    const url = (name: string) => `https://media.lytro.app/tenants/${SHOP}/${name}/h.webp`;
    const csv = await csvOf(
      storeWith(
        [
          photo('black-front', BLACK),
          photo('striped-front', STRIPED),
          photo('striped-back', STRIPED),
          photo('pair', null),
        ],
        [],
        [variant(RED, StockState.In, STRIPED), variant(BLUE, StockState.In, BLACK)],
      ),
    );
    const [, striped, black] = csv.split('\n');
    expect(striped).toContain(`,${url('striped-front')},"${url('striped-back')},${url('pair')}",`);
    expect(striped).not.toContain('black-front');
    expect(black).toContain(`,${url('black-front')},${url('pair')},`);
    expect(black).not.toContain('striped');
  });

  it('leaves the photo columns empty for a product with none', async () => {
    const csv = await csvOf(storeWith([], []));
    expect(csv.split('\n')[1]).toContain(',1500.00 BDT,');
    expect(csv.split('\n')[1]?.endsWith(`?v=${RED},,,,,`)).toBe(true);
  });

  // STO-09 (the owner, 2026-11-25): a product with only a video is never sent to Meta without a picture.
  it("gives a product with only a video its video's poster as the photo", async () => {
    const video: FeedVideoRow = { productId: PRODUCT, mediaId: 'clip', hash: 'h' };
    const csv = await csvOf(storeWith([], [], undefined, [video]));
    const poster = `https://media.lytro.app/tenants/${SHOP}/clip/h.poster.webp`;
    expect(csv.split('\n')[1]?.endsWith(`?v=${RED},${poster},,,,`)).toBe(true);
  });

  it('keeps the first photo first for a product with photos and a video', async () => {
    const photo: FeedImageRow = { productId: PRODUCT, mediaId: 'front', hash: 'h', designId: null };
    const video: FeedVideoRow = { productId: PRODUCT, mediaId: 'clip', hash: 'h' };
    const csv = await csvOf(storeWith([photo], [], undefined, [video]));
    const front = `https://media.lytro.app/tenants/${SHOP}/front/h.webp`;
    expect(csv.split('\n')[1]?.endsWith(`?v=${RED},${front},,,,`)).toBe(true);
    expect(csv).not.toContain('poster');
  });
});
