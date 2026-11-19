import { expect, type Page, test } from '@playwright/test';
import {
  ProductRowLayout,
  ProductRowSource,
  StorefrontSectionKind,
  StorefrontThemeKey,
} from '@lytronix/validators';
import type { PublicStorefrontDesign } from '../src/lib/api/storefront-api';
import { makeProduct, meghShop, type ShopFixture } from './support/fixtures';
import { openShop } from './support/shop';

// OFFERS-PLAN OF-8, OF-12, OF-21, OF-22: an offer's page at /offers/<its link name> -- its name and cut over its cards,
// or, once ended, the note and the same products at their prices now; a home row of a running offer; an offer not
// public is not found. The mock server lists an offer's products by its link name, as the API does.

const SAREE = makeProduct({ id: 'saree', slug: 'silk-saree', name: 'Silk saree', price: 2560 });
const SCARF = makeProduct({ id: 'scarf', slug: 'silk-scarf', name: 'Silk scarf', price: 720 });
const KURTI = makeProduct({ id: 'kurti', slug: 'cotton-kurti', name: 'Cotton kurti', price: 1250 });
const OFFER_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const offers = (): NonNullable<ShopFixture['offers']> => [
  {
    name: 'Eid offer',
    slug: 'eid-offer',
    state: 'running',
    cut: { kind: 'percent', amount: 20 },
    products: 2,
    productIds: [SAREE.card.id, SCARF.card.id],
  },
  {
    name: 'Puja offer',
    slug: 'puja-offer',
    state: 'ended',
    cut: { kind: 'taka', amount: 200 },
    products: 1,
    productIds: [KURTI.card.id],
  },
  {
    name: 'ঈদ অফার',
    slug: 'ঈদ-অফার',
    state: 'running',
    cut: { kind: 'percent', amount: 10 },
    products: 1,
    productIds: [KURTI.card.id],
  },
];

const openOfferShop = (page: Page, design: PublicStorefrontDesign | null = null) =>
  openShop(page, (language) => ({
    products: [SAREE, SCARF, KURTI],
    offers: offers(),
    ...(design ? { info: { ...meghShop(language).info, design } } : {}),
  }));

test.describe("an offer's page (OF-8, OF-12)", () => {
  test('shows a running offer: its name and cut over exactly its cards', async ({ page }) => {
    const shop = await openOfferShop(page);
    const answer = await page.goto(shop.url('/offers/eid-offer'));
    expect(answer?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Eid offer' })).toBeVisible();
    await expect(page.locator('.of-head .sub')).toHaveText('20% off 2 products');
    await expect(page.getByText('Silk saree')).toBeVisible();
    await expect(page.getByText('Silk scarf')).toBeVisible();
    await expect(page.getByText('Cotton kurti')).toHaveCount(0);
    await expect(page.locator('.of-ended')).toHaveCount(0);
    expect(
      (await shop.sent()).listRequests.some((asked) => asked.includes('offer=eid-offer')),
    ).toBe(true);
  });

  test('says an ended offer has ended, with its products and the way to what is on sale now', async ({
    page,
  }) => {
    const shop = await openOfferShop(page);
    await page.goto(shop.url('/offers/puja-offer'));
    const note = page.locator('.of-ended');
    await expect(note).toContainText('This offer has ended');
    await expect(note.getByRole('link', { name: /on sale now/ })).toHaveAttribute(
      'href',
      '/offers',
    );
    await expect(page.getByText('Cotton kurti')).toBeVisible();
  });

  test('opens an offer named in Bangla, and finds none for a name it does not know', async ({
    page,
  }) => {
    const shop = await openOfferShop(page);
    const bangla = await page.goto(shop.url('/offers/ঈদ-অফার'));
    expect(bangla?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'ঈদ অফার' })).toBeVisible();
    const missing = await page.goto(shop.url('/offers/no-such-offer'));
    expect(missing?.status()).toBe(404);
  });

  test("draws a running offer's home row, titled with its name, its See all on the offer's page", async ({
    page,
  }) => {
    const design: PublicStorefrontDesign = {
      // A theme whose row headings carry "See all" (Royal's centred ones do not).
      theme: StorefrontThemeKey.Studio,
      palette: 0,
      sections: [
        {
          id: 'eid-row',
          visible: true,
          kind: StorefrontSectionKind.Products,
          source: ProductRowSource.Offer,
          categoryId: null,
          offerId: OFFER_ID,
          productIds: [],
          title: null,
          layout: ProductRowLayout.Grid,
          count: 4,
        },
      ],
      images: {},
      categories: [],
      products: [],
      offers: [{ id: OFFER_ID, slug: 'eid-offer', name: 'Eid offer' }],
      preview: false,
    };
    const shop = await openOfferShop(page, design);
    await page.goto(shop.url('/'));
    const row = page.locator('.sb-sec:has(.sb-card)');
    await expect(row.locator('h2')).toHaveText('Eid offer');
    await expect(row.locator('.sb-card')).toHaveCount(2);
    await expect(row.locator('.sb-all')).toHaveAttribute('href', '/offers/eid-offer');
  });
});
