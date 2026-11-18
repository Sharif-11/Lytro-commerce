import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  AnnouncementItemKind,
  BannerLayout,
  HeroDesign,
  ProductRowSource,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
} from '@lytronix/validators';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, SB-16 (PR 3b): each section's own sheet -- the hero and its slides, the
// offer banners with an upload and its focal point, a row of products on one category or hand-picked, the
// announcement bar's list (BL-10), the hero's tiles and the auto banners' collections and layout (BL-2 to BL-9), and
// the wide banner, testimonials and About that open their sheet first. Done saves a
// section into the draft in one save; closing a changed sheet asks first. Each test runs on a phone and a desktop.

interface Saved {
  sections: (Record<string, unknown> & { id: string; kind: string })[];
}

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/settings/storefront/design`);
  return log;
}

const saved = (log: ApiLog) =>
  (log.sent('PUT', '/storefront/design') as { design: Saved } | undefined)?.design;

function main(page: Page) {
  return page.getByRole('main');
}

/** A PNG this size, drawn in the page, to upload. */
async function picture(page: Page, width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w, h);
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#a3195b';
        context.fillRect(0, 0, w, h);
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    [width, height] as const,
  );
  return Buffer.from(bytes);
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('iframe')
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('the hero: its slides edited and moved, saved into the draft with Done', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Hero slides' }).click();
  const sheet = page.getByRole('dialog', { name: 'Hero slides' });
  await expect(sheet.getByRole('radio', { name: 'My own slides' })).toBeChecked();
  // The Soft theme's own design is marked, the theme naming it.
  await expect(sheet.getByRole('radio', { name: 'Photo and words' })).toBeChecked();
  await expect(sheet.getByText('The Soft theme’s own: Photo and words.')).toBeVisible();
  await expect(sheet.getByText('Slides (3 of 3)')).toBeVisible();
  await expectAccessible(page);

  await sheet.getByRole('button', { name: 'Open Glow for Eid' }).click();
  const slide = page.getByRole('dialog', { name: 'Slide 1' });
  await expect(slide.getByLabel('Headline')).toHaveValue('Glow for Eid');
  await slide.getByLabel('Headline').fill('Eid glow');
  await slide.getByRole('button', { name: 'Done' }).click();
  await sheet.getByRole('button', { name: 'Move Skin care up' }).click();
  expect(saved(log)).toBeUndefined();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('Hero slides saved to your draft')).toBeVisible();
  await expect
    .poll(() => {
      const hero = saved(log)?.sections[1] as { slides?: { headline: string }[] } | undefined;
      return hero?.slides?.map((each) => each.headline);
    })
    .toEqual(['Eid glow', 'Skin care', 'New lipsticks']);
});

test('a banner of your own: a narrow photo turned away, the focal point, and a button that leads to a category', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Offer banners' }).click();
  const sheet = page.getByRole('dialog', { name: 'Offer banners' });
  await expect(sheet.getByRole('button', { name: 'Add a banner' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Open Gift sets' }).click();
  await page
    .getByRole('dialog', { name: 'Banner 2' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await sheet.getByRole('button', { name: 'Add a banner' }).click();

  const banner = page.getByRole('dialog', { name: 'Banner 3' });
  await banner.getByRole('button', { name: 'Done' }).click();
  await expect(banner.getByText('Add a photo.')).toBeVisible();
  await expect(banner.getByText('Write the headline.')).toBeVisible();

  await banner.getByLabel('Photo').setInputFiles({
    name: 'small.png',
    mimeType: 'image/png',
    buffer: await picture(page, 800, 600),
  });
  await expect(
    banner.getByText(
      'This photo is 800 px wide once stored. A slide or banner needs at least 1200.',
    ),
  ).toBeVisible();
  await banner.getByLabel('Photo').setInputFiles({
    name: 'wide.png',
    mimeType: 'image/png',
    buffer: await picture(page, 1600, 900),
  });
  const focus = banner.getByRole('button', { name: /^Focal point, 50% across and 50% down/ });
  await expect(focus).toBeVisible();
  await focus.press('ArrowRight');
  await expect(
    banner.getByRole('button', { name: /^Focal point, 55% across and 50% down/ }),
  ).toBeVisible();
  await banner.getByLabel('Headline').fill('Free delivery');
  await expect(banner.getByText('13/40 characters')).toBeVisible();

  await banner.getByRole('button', { name: /Button leads to/ }).click();
  const leads = page.getByRole('dialog', { name: 'Button leads to' });
  await leads.getByRole('radio', { name: 'A category' }).click();
  await leads.getByRole('radio', { name: /Jackets/ }).click();
  await leads.getByRole('button', { name: 'Done' }).click();
  await expect(banner.getByText('Category: Jackets')).toBeVisible();
  await banner.getByRole('button', { name: 'Done' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect
    .poll(() => (saved(log)?.sections[4] as { banners?: unknown[] } | undefined)?.banners?.[2])
    .toEqual({
      photo: { mediaId: 'm-logo', focusX: 55, focusY: 50 },
      kicker: null,
      headline: 'Free delivery',
      description: null,
      button: 'Shop',
      link: { kind: StorefrontLinkKind.Category, categoryId: 'c-jackets' },
    });
});

test('a row of products: one category, asked for until chosen; hand-picked, in the order chosen', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Best sellers' }).click();
  const row = page.getByRole('dialog', { name: 'Product row' });
  await row.getByRole('radio', { name: /One category/ }).click();
  await row.getByRole('button', { name: 'Done' }).click();
  await expect(row.getByText('Choose the category.')).toBeVisible();
  await row.getByLabel('Category').selectOption('c-jackets');
  await row.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => saved(log)?.sections[5])
    .toMatchObject({ source: 'category', categoryId: 'c-jackets', productIds: [] });

  await main(page).getByRole('button', { name: 'Open Just in' }).click();
  await row.getByRole('radio', { name: /Hand-picked/ }).click();
  await row.getByRole('button', { name: /Chosen products/ }).click();
  const pick = page.getByRole('dialog', { name: 'Choose products' });
  await pick.getByRole('checkbox', { name: 'Cotton T-shirt' }).check();
  await pick.getByRole('checkbox', { name: 'Denim jacket' }).check();
  await expect(pick.getByText('2 of 12 chosen, in this order')).toBeVisible();
  await pick.getByRole('button', { name: 'Move Denim jacket up' }).click();
  await pick.getByRole('button', { name: 'Done' }).click();
  await expect(row.getByText('2 of 12 chosen, in this order')).toBeVisible();
  // A hand-picked row shows what was chosen: no "how many".
  await expect(row.getByRole('radiogroup', { name: 'How many' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => saved(log)?.sections[3])
    .toMatchObject({ source: 'picked', productIds: ['p-2', 'p-1'], categoryId: null });
});

test('the announcement bar: its automatic items switched, a line of your own, shown two at a time', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Announcement bar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Announcement bar' });
  await expect(sheet.getByText('Lines (4 of 6), in this order')).toBeVisible();
  await expect(sheet.getByText('As shoppers see it: two at a time')).toBeVisible();
  await sheet.getByRole('switch', { name: 'Show Offers on now' }).click();
  await sheet.getByRole('button', { name: 'Add a line of your own' }).click();
  const line = page.getByRole('dialog', { name: 'Your line' });
  await line.getByRole('button', { name: 'Done' }).click();
  await expect(line.getByText('Write your line.')).toBeVisible();
  await line.getByLabel('Your line').fill('Free wrapping');
  await expect(line.getByText('13/40 characters')).toBeVisible();
  await line.getByRole('button', { name: 'Done' }).click();
  await sheet.getByRole('button', { name: 'Move Free wrapping up' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => saved(log)?.sections[0])
    .toMatchObject({
      kind: StorefrontSectionKind.Announcement,
      items: [
        { kind: AnnouncementItemKind.CashOnDelivery, visible: true },
        { kind: AnnouncementItemKind.Delivery, visible: true },
        { kind: AnnouncementItemKind.Offers, visible: false },
        { kind: AnnouncementItemKind.Own, text: 'Free wrapping' },
        { kind: AnnouncementItemKind.Own, text: 'A gift with Eid orders over ৳2,000' },
      ],
    });
});

test('the hero filling itself: what its slides show, and the collection each tile shows', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Hero slides' }).click();
  const sheet = page.getByRole('dialog', { name: 'Hero slides' });
  await sheet.getByRole('radio', { name: 'Auto: from your shop' }).click();
  await sheet.getByRole('radio', { name: 'Best sellers' }).click();
  await expect(sheet.getByText('Your 3 best sellers of the last 30 days')).toBeVisible();
  // The tiles are the slide-and-tiles design's alone.
  await expect(sheet.getByText('The tiles show')).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'Slide and two tiles' }).click();
  await sheet.getByRole('button', { name: /Tile 2 · Just in/ }).click();
  const tile = page.getByRole('dialog', { name: 'Tile 2 shows' });
  // A tile shows a collection, never one product.
  await expect(tile.getByRole('radio', { name: 'A product' })).toHaveCount(0);
  await tile.getByRole('radio', { name: 'A category' }).click();
  await tile.getByRole('radio', { name: /Jackets/ }).click();
  await tile.getByRole('button', { name: 'Done' }).click();
  await expect(sheet.getByRole('button', { name: /Tile 2 · Category: Jackets/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => saved(log)?.sections[1])
    .toMatchObject({
      fill: StorefrontFill.Auto,
      source: ProductRowSource.BestSellers,
      design: HeroDesign.SlideTiles,
      tiles: [
        { kind: StorefrontLinkKind.OnSale },
        { kind: StorefrontLinkKind.Category, categoryId: 'c-jackets' },
      ],
    });
});

test('banners filling themselves: a collection each, and a layout that fits their number', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Offer banners' }).click();
  const sheet = page.getByRole('dialog', { name: 'Offer banners' });
  await sheet.getByRole('radio', { name: 'Auto: from your shop' }).click();
  await expect(sheet.getByRole('radio', { name: 'Big + two' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Open Banner 3 · Best sellers' }).click();
  await page
    .getByRole('dialog', { name: 'Banner 3 shows' })
    .getByRole('button', { name: 'Remove' })
    .click();
  // Two banners: side by side by their number; big + two no longer fits.
  await expect(sheet.getByRole('radio', { name: 'Side by side' })).toBeChecked();
  await expect(sheet.getByRole('radio', { name: 'Big + two' })).toBeDisabled();
  await sheet.getByRole('radio', { name: 'Full width' }).click();
  await sheet.getByRole('button', { name: 'Add a banner' }).click();
  // A banner added shows the first collection a new section starts with that the others don't.
  const added = page.getByRole('dialog', { name: 'Banner 3 shows' });
  await expect(added.getByRole('radio', { name: 'Best sellers' })).toBeChecked();
  await added.getByRole('button', { name: 'Done' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => saved(log)?.sections[4])
    .toMatchObject({
      fill: StorefrontFill.Auto,
      layout: BannerLayout.Full,
      collections: [
        { kind: StorefrontLinkKind.OnSale },
        { kind: StorefrontLinkKind.JustIn },
        { kind: StorefrontLinkKind.BestSellers },
      ],
    });
});

test('closing a changed sheet asks first; Discard leaves the draft as it was', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Open Categories' }).click();
  const sheet = page.getByRole('dialog', { name: 'Categories' });
  await sheet.getByRole('radio', { name: 'Square photos' }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  const asked = page.getByRole('dialog', { name: 'Discard your changes?' });
  await asked.getByRole('button', { name: 'Keep editing' }).click();
  await expect(sheet.getByRole('radio', { name: 'Square photos' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await asked.getByRole('button', { name: 'Discard' }).click();
  await expect(sheet).toBeHidden();
  expect(saved(log)).toBeUndefined();
});

test('testimonials, About and a wide banner open their sheet first, and join the draft with Done', async ({
  page,
}) => {
  const log = await open(page);
  const add = async (kind: RegExp) => {
    await page.getByRole('button', { name: 'Add a section' }).first().click();
    await page
      .getByRole('dialog', { name: 'Add a section' })
      .getByRole('button', { name: kind })
      .click();
  };
  const last = () => saved(log)?.sections.at(-1);

  await add(/Testimonials/);
  const quotes = page.getByRole('dialog', { name: 'Testimonials' });
  await quotes.getByRole('button', { name: 'Done' }).click();
  await expect(quotes.getByText('Add at least one quote.')).toBeVisible();
  await quotes.getByRole('button', { name: 'Add a quote' }).click();
  const quote = page.getByRole('dialog', { name: 'Quote 1' });
  await quote.getByLabel('Name').fill('Mim');
  await quote.getByLabel('What they said').fill('Lovely packing.');
  await quote.getByRole('button', { name: 'Done' }).click();
  await quotes.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Testimonials added above the footer')).toBeVisible();
  await expect.poll(last).toMatchObject({
    kind: 'testimonials',
    quotes: [{ name: 'Mim', place: null, text: 'Lovely packing.' }],
  });

  await add(/About the shop/);
  const about = page.getByRole('dialog', { name: 'About the shop' });
  await about.getByLabel('Title').fill('Our story');
  await about.getByLabel('Text').fill('A small shop of good things.');
  await about.getByRole('button', { name: 'Done' }).click();
  await expect.poll(last).toMatchObject({
    kind: 'about',
    title: 'Our story',
    text: 'A small shop of good things.',
    photo: null,
  });

  await add(/Wide banner/);
  const wide = page.getByRole('dialog', { name: 'Wide banner' });
  await wide.getByLabel('Photo').setInputFiles({
    name: 'wide.png',
    mimeType: 'image/png',
    buffer: await picture(page, 1600, 700),
  });
  await expect(wide.getByRole('button', { name: /^Focal point/ })).toBeVisible();
  await wide.getByLabel('Headline').fill('Dressed for Eid');
  await wide.getByRole('button', { name: 'Done' }).click();
  await expect.poll(last).toMatchObject({
    kind: 'wide_banner',
    banner: { headline: 'Dressed for Eid', button: 'Shop now' },
  });
});
