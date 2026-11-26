import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  type PreviewLayout,
} from '@lytronix/validators';
import { mockApi, SLUG, type ApiLog, type Language, type ShopState } from './support/mock-api';
import { DRAWN, drawnDesign, PREVIEW_TOKEN, startingOnly } from './support/storefront-design';

// STOREFRONT-BUILDER-PLAN SB-5, SB-7 to SB-13 (PR 3a): Settings > Storefront > Design -- the theme and its colour sets,
// the logo and icon, the home page's sections shown, hidden, moved, added and removed, each change saved to the draft;
// the live preview of the draft beside it on a desktop and over the screen on a phone; Publish, which says first what
// changes; Back and Discard, asked first; the theme gallery; the logo and icon with their previews. Each test runs on a
// phone and a desktop (playwright.config.ts).

const PAGE = '/settings/storefront/design';

async function open(page: Page, path = PAGE, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  // The preview is the real storefront at the shop's own address; here, a page that says what it was asked for.
  // SB-32 as amended: /preview itself; what it leaves out (/preview/layout) is the mock's own (mockApi).
  await page.route(
    (url) => url.hostname.endsWith('.lytro.app') && url.pathname === '/preview',
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>preview</title><p>${route.request().url()}</p>`,
      }),
  );
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function savedDraft(log: ApiLog) {
  return (
    log.sent('PUT', '/storefront/design') as
      | {
          design: {
            theme: string;
            palette: number;
            sections: { id: string; kind: string; visible: boolean }[];
          };
        }
      | undefined
  )?.design;
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    // The live preview is the storefront's own page, checked in its own tests.
    .exclude('iframe')
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

const isDesktop = () => test.info().project.name === 'desktop';

test('Storefront has the Design line, which opens the design page with its theme, logo and icon, and sections', async ({
  page,
}) => {
  await open(page, '/settings/storefront');
  const line = main(page).getByRole('link', { name: /Storefront design/ });
  await expect(line).toContainText('Theme, logo and icon, home page sections');
  await line.click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${PAGE}$`));
  await expect(main(page).getByRole('heading', { name: 'Theme: Soft' })).toBeVisible();
  // Beside the title on a phone, beside the preview's on a desktop.
  await expect(main(page).getByText('Draft · 3 changes').filter({ visible: true })).toBeVisible();
  const rows = main(page).getByRole('listitem');
  await expect(rows).toHaveText([
    /Announcement bar\s*4 lines, two at a time/,
    /Header\s*Logo, menu, search, cart/,
    /Hero slides\s*3 slides · own photos/,
    /Categories\s*Auto: all categories · round photos/,
    /Just in\s*Auto: the 6 newest · carousel/,
    /Offer banners\s*3 banners · big \+ two/,
    /Best sellers\s*Auto: top 4 · grid/,
    // SB-32 as amended (`de-sections`): locked after the last row of products.
    /All products\s*Always last: every other product is here/,
    /Testimonials\s*3 quotes/,
    /Trust strip\s*Auto: cash on delivery, fees, payment/,
    /About the shop\s*Off/,
    /Footer\s*Contact, social links, Powered by Lytro/,
  ]);
  await expect(main(page).getByRole('switch', { name: 'Show About the shop' })).not.toBeChecked();
  await expectAccessible(page);
});

test('hides, moves, adds and removes sections, each saved whole to the draft', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('switch', { name: 'Show Testimonials' }).click();
  await expect.poll(() => savedDraft(log)?.sections[6]?.visible).toBe(false);
  await expect(main(page).getByRole('listitem').filter({ hasText: 'Testimonials' })).toContainText(
    'Off',
  );

  await main(page).getByRole('button', { name: 'Move Trust strip up' }).click();
  await expect
    .poll(() =>
      savedDraft(log)
        ?.sections.slice(6, 8)
        .map((each) => each.kind),
    )
    .toEqual([StorefrontSectionKind.Trust, StorefrontSectionKind.Testimonials]);
  await expect(main(page).getByRole('button', { name: 'Move Announcement bar up' })).toBeDisabled();

  await page.getByRole('button', { name: 'Add a section' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add a section' });
  await sheet.getByRole('button', { name: /Product row/ }).click();
  // Named, as every row of products is, by what it lists: the newest, until it is changed.
  await expect(page.getByText('Just in added above the footer')).toBeVisible();
  await expect.poll(() => savedDraft(log)?.sections.length).toBe(10);
  expect(savedDraft(log)?.sections.at(-1)?.kind).toBe(StorefrontSectionKind.Products);

  // Opened from its row, its own sheet removes it, asked first (each sheet: section-sheets.spec.ts).
  await main(page).getByRole('button', { name: 'Open Offer banners' }).click();
  const section = page.getByRole('dialog', { name: 'Offer banners' });
  await expect(section.getByRole('radio', { name: 'My own banners' })).toBeChecked();
  await section.getByRole('button', { name: 'Remove section' }).click();
  const asked = page.getByRole('dialog', { name: 'Remove Offer banners?' });
  await expect(asked).toContainText('To keep it for later, turn it off instead.');
  await asked.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => savedDraft(log)?.sections.length).toBe(9);
  expect(savedDraft(log)?.sections.map((each) => each.kind)).not.toContain(
    StorefrontSectionKind.OfferBanners,
  );
  await expect(page.getByText('Offer banners removed')).toBeVisible();
});

test('a section dragged by its handle, with a mouse or a finger, saves its new place once; the arrow keys move it one (BL-1)', async ({
  page,
}) => {
  const log = await open(page);
  const saves = () =>
    log.calls.filter((call) => call.method === 'PUT' && call.path === '/storefront/design').length;
  const kinds = () => savedDraft(log)?.sections.map((each) => each.kind);
  const handle = main(page).getByRole('button', { name: 'Drag Best sellers' });
  const target = main(page).getByRole('button', { name: 'Open Offer banners' });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('the rows are on the page');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  // Held, the list shows where it would go, and nothing is saved yet.
  await expect(main(page).getByRole('listitem').nth(5)).toContainText('Best sellers');
  expect(saves()).toBe(0);
  await page.mouse.up();
  await expect.poll(saves).toBe(1);
  expect(kinds()?.slice(3, 6)).toEqual([
    StorefrontSectionKind.Products,
    StorefrontSectionKind.Products,
    StorefrontSectionKind.OfferBanners,
  ]);
  expect(savedDraft(log)?.sections[4]?.id).toBe('00000000-0000-4000-8000-000000000006');

  // The handle with the keyboard: one place up, saved.
  await main(page).getByRole('button', { name: 'Drag Trust strip' }).press('ArrowUp');
  await expect.poll(saves).toBe(2);
  expect(kinds()?.slice(6, 8)).toEqual([
    StorefrontSectionKind.Trust,
    StorefrontSectionKind.Testimonials,
  ]);
  // The header and the footer have no handle.
  await expect(main(page).getByRole('button', { name: /^Drag (Header|Footer)$/ })).toHaveCount(0);
});

test('a colour set is one tap, saved to the draft', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Colour set 2' }).click();
  await expect.poll(() => savedDraft(log)?.palette).toBe(1);
  await expect(main(page).getByRole('button', { name: 'Colour set 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Publish says first what changes, then shoppers see it; the draft is gone after', async ({
  page,
}) => {
  const log = await open(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Publish?' });
  await expect(sheet.getByRole('listitem')).toHaveText([
    'Theme: Fresh to Soft',
    '“Hero slides” changed',
    '“About the shop” turned off',
  ]);
  await expect(sheet).toContainText('Shoppers see the new design within a minute.');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published. Shoppers see it within a minute.')).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/storefront/design/publish'),
  ).toBe(true);
  await expect(main(page).getByText(/Draft ·/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
});

test('Back to the previous design and Discard the draft are each asked first', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Discard the draft' }).click();
  const discard = page.getByRole('dialog', { name: 'Discard the draft?' });
  await discard.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Draft discarded')).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'DELETE' && call.path === '/storefront/design/draft'),
  ).toBe(true);
  // Without a draft the page shows what shoppers see: Fresh.
  await expect(main(page).getByRole('heading', { name: 'Theme: Fresh' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Back to the previous design' }).click();
  const back = page.getByRole('dialog', { name: 'Back to the previous design?' });
  await expect(back).toContainText('Tap it again to come back to this one.');
  await back.getByRole('button', { name: 'Go back' }).click();
  await expect(main(page).getByRole('heading', { name: 'Theme: Studio' })).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/storefront/design/back'),
  ).toBe(true);
});

test('a shop that has published nothing edits its starting design; nothing to go back to', async ({
  page,
}) => {
  await open(page, PAGE, { design: startingOnly() });
  await expect(main(page).getByRole('heading', { name: 'Theme: Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  await expect(main(page).getByRole('button', { name: 'Back to the previous design' })).toHaveCount(
    0,
  );
  await expect(main(page).getByRole('button', { name: 'Discard the draft' })).toHaveCount(0);
});

test('the live preview draws the draft: beside the editor on a desktop, over the screen on a phone', async ({
  page,
}) => {
  const log = await open(page);
  const link = `https://${SLUG}.lytro.app/preview?t=${PREVIEW_TOKEN}`;
  if (isDesktop()) {
    const frame = main(page).locator('iframe[title="Live preview · draft"]');
    await expect(frame).toHaveAttribute('src', new RegExp(`^${link.replaceAll('?', '\\?')}&v=0$`));
    await expect(frame.contentFrame().getByText(link)).toBeVisible();
    // Each save draws it again.
    await main(page).getByRole('switch', { name: 'Show Testimonials' }).click();
    await expect(frame).toHaveAttribute('src', /&v=1$/);
    await main(page).getByRole('button', { name: 'Phone' }).click();
    await expect(main(page).getByRole('button', { name: 'Phone' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    await page.getByRole('button', { name: 'Preview' }).click();
    const full = page.getByRole('dialog', { name: 'Live preview · draft' });
    await expect(full.locator('iframe')).toHaveAttribute(
      'src',
      new RegExp(link.replaceAll('?', '\\?')),
    );
    await full.getByRole('button', { name: 'Close the preview' }).click();
    await expect(full).toBeHidden();
  }
  expect(log.calls.filter((call) => call.path === '/storefront/design/preview')).toHaveLength(1);
});

test('the theme gallery tries a theme without touching the draft, and uses it on its first colours', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('link', { name: 'Change theme' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${PAGE}/themes$`));
  await expect(main(page).getByRole('heading', { level: 2 })).toHaveText([
    'Royal',
    'Fresh',
    'Bold',
    /Soft\s*On/,
    'Studio',
  ]);
  await expectAccessible(page);
  const studio = main(page)
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Studio' }) })
    .last();
  await studio.getByRole('button', { name: 'Try this theme' }).click();
  const heading = 'Trying: Studio · not in your draft yet';
  const frame = isDesktop()
    ? main(page).locator('iframe')
    : page.getByRole('dialog', { name: 'Live preview · draft' }).locator('iframe');
  await expect(frame).toHaveAttribute('src', /&theme=studio$/);
  const tried = isDesktop()
    ? main(page)
    : page.getByRole('dialog', { name: 'Live preview · draft' });
  await expect(tried.getByText(heading)).toBeVisible();
  expect(log.calls.some((call) => call.method === 'PUT')).toBe(false);
  await page.getByRole('button', { name: 'Use the Studio theme' }).click();
  await expect
    .poll(() => savedDraft(log))
    .toMatchObject({ theme: StorefrontThemeKey.Studio, palette: 0 });
  await expect(page.getByText('Studio is in your draft')).toBeVisible();
  await expect(main(page).getByRole('heading', { name: /Studio\s*On/ })).toBeVisible();
});

test('the logo and icon: previews at once, an icon that is not square refused, nothing changes until Save', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('link', { name: 'Logo and icon' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${PAGE}/brand$`));
  await expect(main(page).getByText('No icon yet: the first letter of your name')).toBeVisible();
  await expectAccessible(page);

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('Icon: website and app')
    .setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: pixel });
  await expect(
    main(page).getByText('The icon must be square, at least 512 × 512 px. This one is 1 × 1.'),
  ).toBeVisible();

  const square = Buffer.from(
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(512, 512);
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#a3195b';
        context.fillRect(0, 0, 512, 512);
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
  await page
    .getByLabel('Icon: website and app')
    .setInputFiles({ name: 'rupkotha-icon.png', mimeType: 'image/png', buffer: square });
  await expect(main(page).getByText('rupkotha-icon.png')).toBeVisible();
  await expect(main(page).getByText(/512 × 512 · \d+ KB/)).toBeVisible();
  expect(log.sent('PUT', '/shop-settings/icon')).toBeUndefined();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Logo and icon saved')).toBeVisible();
  expect(log.sent('PUT', '/shop-settings/icon')).toEqual({ mediaId: 'm-logo' });
  expect(log.sent('PUT', '/shop-settings/logo')).toBeUndefined();
});

test('reads in Bangla', async ({ page }) => {
  await open(page, PAGE, { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'থিম: কোমল' })).toBeVisible();
  await expect(
    main(page).getByText('খসড়া · 3টি পরিবর্তন').filter({ visible: true }),
  ).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'হোম পেজের সেকশন' })).toBeVisible();
  await expect(main(page).getByText('অটো: সব ক্যাটাগরি · গোল ছবি')).toBeVisible();
  await expect(page.getByRole('button', { name: 'প্রকাশ করুন' })).toBeEnabled();
});

// The approved sketch's screens beside the built ones (docs/brand/lytro-storefront-builder.html), saved to
// test-results/compare for the pull request. No pixel baseline: the pictures are for a person to compare.
const SKETCH = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/brand/lytro-storefront-builder.html'),
).href;

/** The way into a sheet, in the shot's language: a row opened, then a choice or a step within it. */
type Steps = (page: Page, say: (bn: string, en: string) => string) => Promise<void>;

const openRow = async (page: Page, name: string) => {
  await page.getByRole('main').getByRole('button', { name }).click();
};
const inSheet = (page: Page) => page.getByRole('dialog').last();

/** SB-32 as amended (`de-*`): the drawn design, with what the storefront says its home leaves out. */
const leaving = (layout: PreviewLayout): ShopState => ({ design: { ...drawnDesign(), layout } });
const LEFT_OUT: PreviewLayout = {
  rows: [{ sectionId: DRAWN.best, fill: 4 }],
  items: [{ sectionId: DRAWN.banners, index: 0, link: StorefrontLinkKind.OnSale }],
};

const SHOTS: { screen: string; path: string; then?: Steps; state?: ShopState }[] = [
  { screen: 'e-home', path: PAGE },
  // SB-32 as amended (the owner, 2026-11-26): the editor says what the home does by itself.
  { screen: 'de-sections', path: PAGE },
  {
    screen: 'de-all-info',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('সব প্রোডাক্ট খুলুন', 'Open All products'));
    },
  },
  { screen: 'de-list-hidden', path: PAGE, state: leaving(LEFT_OUT) },
  {
    screen: 'de-row-hidden',
    path: PAGE,
    state: leaving(LEFT_OUT),
    then: async (page, say) => {
      await openRow(page, say('সবচেয়ে বেশি বিক্রি খুলুন', 'Open Best sellers'));
    },
  },
  {
    screen: 'de-row-grid',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('নতুন এসেছে খুলুন', 'Open Just in'));
      await inSheet(page)
        .getByRole('radio', { name: say('গ্রিড', 'Grid') })
        .click();
      await inSheet(page).getByRole('radio', { name: '8' }).click();
    },
  },
  {
    screen: 'de-banner-hidden',
    path: PAGE,
    state: leaving(LEFT_OUT),
    then: async (page, say) => {
      await openRow(page, say('অফার ব্যানার খুলুন', 'Open Offer banners'));
      await inSheet(page)
        .getByRole('button', { name: say('Up to 30% off খুলুন', 'Open Up to 30% off') })
        .click();
    },
  },
  { screen: 'e-themes', path: `${PAGE}/themes` },
  { screen: 'e-brand', path: `${PAGE}/brand` },
  {
    screen: 'e-add',
    path: PAGE,
    then: async (page) => {
      await page
        .getByRole('button', { name: /Add a section|সেকশন যোগ করুন/ })
        .first()
        .click();
    },
  },
  {
    screen: 'e-publish',
    path: PAGE,
    then: async (page) => {
      await page.getByRole('button', { name: /^(Publish|প্রকাশ করুন)$/ }).click();
    },
  },
  // Design cards (DC-2, DC-6 to DC-8): the design page's switch card, and the Product list.
  {
    screen: 'e-cards',
    path: PAGE,
    then: async (page) => {
      await page
        .getByRole('main')
        .getByRole('heading', { name: /Products in your shop|দোকানে প্রোডাক্ট/ })
        .scrollIntoViewIfNeeded();
    },
  },
  { screen: 'e-order', path: `${PAGE}/products` },
  // PR 3b: each section's own sheet, and the steps within one.
  {
    screen: 'e-hero',
    path: PAGE,
    // BL-2, BL-3: switched to filling itself, as the slide-and-tiles design.
    then: async (page, say) => {
      await openRow(page, say('হিরো স্লাইড খুলুন', 'Open Hero slides'));
      await inSheet(page)
        .getByRole('radio', { name: say('অটো: দোকান থেকে', 'Auto: from your shop') })
        .click();
      await inSheet(page)
        .getByRole('radio', { name: say('স্লাইড আর দুই টাইল', 'Slide and two tiles') })
        .click();
    },
  },
  {
    screen: 'e-place',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('হিরো স্লাইড খুলুন', 'Open Hero slides'));
      await inSheet(page)
        .getByRole('radio', { name: say('অটো: দোকান থেকে', 'Auto: from your shop') })
        .click();
      await inSheet(page)
        .getByRole('radio', { name: say('স্লাইড আর দুই টাইল', 'Slide and two tiles') })
        .click();
      await inSheet(page)
        .getByRole('button', { name: new RegExp(say('টাইল 1', 'Tile 1')) })
        .click();
    },
  },
  {
    screen: 'e-slide',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('হিরো স্লাইড খুলুন', 'Open Hero slides'));
      await inSheet(page)
        .getByRole('button', { name: say('Glow for Eid খুলুন', 'Open Glow for Eid') })
        .click();
    },
  },
  {
    screen: 'e-link',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('হিরো স্লাইড খুলুন', 'Open Hero slides'));
      await inSheet(page)
        .getByRole('button', { name: say('Glow for Eid খুলুন', 'Open Glow for Eid') })
        .click();
      await inSheet(page)
        .getByRole('button', { name: new RegExp(say('বোতাম নিয়ে যাবে', 'Button leads to')) })
        .click();
      await inSheet(page)
        .getByRole('radio', { name: say('একটা ক্যাটাগরি', 'A category') })
        .click();
      await inSheet(page)
        .getByRole('radio', { name: new RegExp(say('জ্যাকেট', 'Jackets')) })
        .click();
    },
  },
  {
    screen: 'e-products',
    path: PAGE,
    then: (page, say) => openRow(page, say('নতুন এসেছে খুলুন', 'Open Just in')),
  },
  {
    screen: 'e-row-cat',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('সবচেয়ে বেশি বিক্রি খুলুন', 'Open Best sellers'));
      await inSheet(page)
        .getByRole('radio', { name: new RegExp(say('একটা ক্যাটাগরির', 'One category')) })
        .click();
      await inSheet(page).getByLabel(say('ক্যাটাগরি', 'Category')).selectOption('c-jackets');
    },
  },
  {
    screen: 'e-pick',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('নতুন এসেছে খুলুন', 'Open Just in'));
      await inSheet(page)
        .getByRole('radio', { name: new RegExp(say('হাতে বাছাই', 'Hand-picked')) })
        .click();
      await inSheet(page)
        .getByRole('button', { name: new RegExp(say('বাছাই করা প্রোডাক্ট', 'Chosen products')) })
        .click();
      for (const at of [3, 0, 4]) {
        await inSheet(page).getByRole('checkbox').nth(at).check();
      }
    },
  },
  {
    screen: 'e-cats',
    path: PAGE,
    then: (page, say) => openRow(page, say('ক্যাটাগরি খুলুন', 'Open Categories')),
  },
  {
    // BL-1: Best sellers held over Offer banners, not yet let go.
    screen: 'e-drag',
    path: PAGE,
    then: async (page, say) => {
      const handle = page
        .getByRole('main')
        .getByRole('button', { name: say('সবচেয়ে বেশি বিক্রি টেনে সরান', 'Drag Best sellers') });
      const target = page
        .getByRole('main')
        .getByRole('button', { name: say('অফার ব্যানার খুলুন', 'Open Offer banners') });
      await handle.scrollIntoViewIfNeeded();
      const from = await handle.boundingBox();
      const to = await target.boundingBox();
      if (!from || !to) throw new Error('the rows are on the page');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    },
  },
  {
    screen: 'e-announce',
    path: PAGE,
    then: (page, say) => openRow(page, say('ঘোষণার লাইন খুলুন', 'Open Announcement bar')),
  },
  {
    screen: 'e-banners',
    path: PAGE,
    then: (page, say) => openRow(page, say('অফার ব্যানার খুলুন', 'Open Offer banners')),
  },
  {
    screen: 'e-banners-auto',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('অফার ব্যানার খুলুন', 'Open Offer banners'));
      await inSheet(page)
        .getByRole('radio', { name: say('অটো: দোকান থেকে', 'Auto: from your shop') })
        .click();
    },
  },
  {
    screen: 'e-banner',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('অফার ব্যানার খুলুন', 'Open Offer banners'));
      await inSheet(page)
        .getByRole('button', { name: say('Up to 30% off খুলুন', 'Open Up to 30% off') })
        .click();
    },
  },
  {
    screen: 'e-wide',
    path: PAGE,
    then: async (page, say) => {
      await page
        .getByRole('button', { name: say('সেকশন যোগ করুন', 'Add a section') })
        .first()
        .click();
      await inSheet(page)
        .getByRole('button', { name: new RegExp(say('বড় ব্যানার', 'Wide banner')) })
        .click();
    },
  },
  {
    screen: 'e-quotes',
    path: PAGE,
    then: (page, say) => openRow(page, say('ক্রেতাদের কথা খুলুন', 'Open Testimonials')),
  },
  {
    screen: 'e-quote',
    path: PAGE,
    then: async (page, say) => {
      await openRow(page, say('ক্রেতাদের কথা খুলুন', 'Open Testimonials'));
      await inSheet(page)
        .getByRole('button', { name: say('Nusrat · Dhaka খুলুন', 'Open Nusrat · Dhaka') })
        .click();
    },
  },
  {
    screen: 'e-about',
    path: PAGE,
    then: (page, say) => openRow(page, say('দোকানের কথা খুলুন', 'Open About the shop')),
  },
];

test.describe('beside the sketch', () => {
  for (const shot of SHOTS) {
    for (const device of ['phone', 'desktop'] as const) {
      for (const language of ['bn', 'en'] as Language[]) {
        test(`${shot.screen} on a ${device} in ${language}`, async ({ browser }) => {
          test.skip(!isDesktop(), 'taken once, in the desktop project');
          const out = `test-results/compare/storefront-${shot.screen}-${device}-${language}`;
          const size =
            device === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
          const drawing = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
          await drawing.goto(`${SKETCH}#${shot.screen}/${device}/${language}/shot`);
          await drawing.waitForTimeout(500);
          await drawing.locator('.frame').screenshot({ path: `${out}-sketch.png` });
          await drawing.close();

          const app = await browser.newPage({
            viewport: size,
            isMobile: device === 'phone',
            hasTouch: device === 'phone',
          });
          await open(app, shot.path, { language, ...shot.state });
          await app.waitForLoadState('networkidle');
          await app.evaluate(() => document.fonts.ready);
          if (shot.then) await shot.then(app, (bn, en) => (language === 'bn' ? bn : en));
          await app.waitForTimeout(400);
          await app.screenshot({ path: `${out}-app.png` });
          await app.close();
        });
      }
    }
  }
});
