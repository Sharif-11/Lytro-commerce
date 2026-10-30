import { describe, expect, it } from 'vitest';
import type { PublicProduct, PublicShop } from '../src/lib/api/storefront-api';
import { productMetadata } from '../src/lib/product/product-metadata';

// LND-05: a shared product or landing link shows a rich preview -- the product's photo, name, price or range, and the
// shop's name -- as server-rendered Open Graph and Twitter Card tags. Facebook's own debugger needs a live address.

const shop = { name: 'Megh Fashion', slug: 'megh' } as PublicShop;
const photo = { id: 'p1', urls: { main: 'https://media.lytro.app/t/p1/a.webp', thumbnail: 'x' } };

function product(values: Partial<PublicProduct> = {}): PublicProduct {
  return {
    name: 'Cotton Panjabi',
    slug: 'cotton-panjabi',
    description: 'Soft  cotton,\nfor every day.',
    minPrice: '1250.00',
    maxPrice: '1250.00',
    images: [photo],
    ...values,
  } as PublicProduct;
}

describe("a landing link's preview (LND-05)", () => {
  it('names the product and the shop, with its price and photo, at the main address', () => {
    const tags = productMetadata(product(), shop, 'https://megh.com', '/l/cotton-panjabi');
    expect(tags.metadataBase?.toString()).toBe('https://megh.com/');
    expect(tags.title).toBe('Cotton Panjabi · Megh Fashion');
    expect(tags.description).toBe('৳1,250 · Soft cotton, for every day.');
    expect(tags.alternates?.canonical).toBe('/l/cotton-panjabi');
    expect(tags.openGraph).toMatchObject({
      url: '/l/cotton-panjabi',
      siteName: 'Megh Fashion',
      title: 'Cotton Panjabi · Megh Fashion',
      images: [{ url: photo.urls.main, alt: 'Cotton Panjabi' }],
    });
    expect(tags.twitter).toMatchObject({ card: 'summary_large_image', images: [photo.urls.main] });
  });

  it('shows a price range, and the shop name where there is no description or photo', () => {
    const tags = productMetadata(
      product({ minPrice: '900.00', maxPrice: '1400.00', description: null, images: [] }),
      shop,
      'https://megh.lytro.app',
      '/p/cotton-panjabi',
    );
    expect(tags.description).toBe('৳900 – ৳1,400 · Megh Fashion');
    expect(tags.openGraph).toMatchObject({ images: [] });
    expect(tags.twitter).toMatchObject({ card: 'summary', images: [] });
  });
});
