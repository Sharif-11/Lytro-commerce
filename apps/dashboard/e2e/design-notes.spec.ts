import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  StorefrontLinkKind,
  StorefrontSectionKind,
  type PreviewLayout,
  type StorefrontSection,
} from '@lytronix/validators';
import { mockApi, SLUG, type ApiLog, type Language } from './support/mock-api';
import { drawnDesign, type DesignFixture } from './support/storefront-design';

// STOREFRONT-BUILDER-PLAN SB-32 as amended (the owner, 2026-11-26: "yes to all", then "yes please" to the sketch's
// `de-*`): the design editor says what the home does by itself -- "সব প্রোডাক্ট" locked in the section list after the
// last row of products; "Not showing now" under a row or banner the live draft leaves out, as the storefront says
// (/preview/layout), and why atop its sheet; a grid's count in whole lines of four. Each test runs on a phone and a
// desktop (playwright.config.ts).

const PAGE = '/settings/storefront/design';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The drawn design (`drawnDesign`): the hero (2), Just in in a carousel of 6 (4), three banners of the shop's own (5),
// the four best sellers in a grid (6).
const HERO = id(2);
const BANNERS = id(5);
const BEST = id(6);
const WIDE = id(30);

function withWide(fixture: DesignFixture): DesignFixture {
  const draft = fixture.draft;
  if (!draft) return fixture;
  const wide: StorefrontSection = {
    id: WIDE,
    visible: true,
    kind: StorefrontSectionKind.WideBanner,
    banner: {
      photo: { mediaId: id(501), focusX: 50, focusY: 40 },
      kicker: null,
      headline: 'A scent for Eid',
      description: null,
      button: 'Shop now',
      link: { kind: StorefrontLinkKind.Category, categoryId: id(77) },
    },
  };
  const sections = [...draft.sections];
  sections.splice(sections.length - 2, 0, wide);
  return { ...fixture, draft: { ...draft, sections } };
}

const LEFT: PreviewLayout = {
  rows: [{ sectionId: BEST, fill: 4 }],
  items: [
    { sectionId: BANNERS, index: 0, link: StorefrontLinkKind.OnSale },
    { sectionId: HERO, index: 1, link: StorefrontLinkKind.OnSale },
    { sectionId: WIDE, index: 0, link: StorefrontLinkKind.Category },
  ],
};

async function open(
  page: Page,
  layout: PreviewLayout | null | undefined,
  language: Language = 'en',
): Promise<ApiLog> {
  const design = withWide(drawnDesign());
  const log = await mockApi(page, {
    language,
    design: layout === undefined ? design : { ...design, layout },
  });
  await page.goto(`/${SLUG}${PAGE}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, name: string) {
  return main(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });
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

test('"All products" sits locked after the last row of products, and a tap says why (de-sections, de-all-info)', async ({
  page,
}) => {
  await open(page, { rows: [], items: [] });
  const names = main(page).getByRole('listitem').locator('b');
  await expect(names).toContainText(['Best sellers', 'All products', 'Wide banner']);
  const all = row(page, 'All products');
  await expect(all).toContainText('Always last: every other product is here');
  await expect(all.getByRole('img', { name: "Can't be moved or switched off" })).toBeVisible();
  await expect(main(page).getByRole('switch', { name: 'Show All products' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Drag All products' })).toHaveCount(0);
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Open All products' }).click();
  const sheet = page.getByRole('dialog', { name: 'All products' });
  await expect(sheet).toContainText("Every product of the shop the rows above didn't show is here");
  await expect(sheet).toContainText("So it can't be moved, switched off or removed.");
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();

  // Best sellers switched off: it goes after Just in, the last row of products still shown.
  await main(page).getByRole('switch', { name: 'Show Best sellers' }).click();
  await expect(names).toContainText(['Just in', 'All products', 'Offer banners']);
});

test('says "Not showing now" under what the live draft leaves out, and nothing while it is all shown (de-list-hidden)', async ({
  page,
}) => {
  await open(page, LEFT);
  await expect(row(page, 'Best sellers').getByText('Not showing now')).toBeVisible();
  await expect(row(page, 'Offer banners').getByText('1 not showing now')).toBeVisible();
  await expect(row(page, 'Hero slides').getByText('1 not showing now')).toBeVisible();
  await expect(row(page, 'Wide banner').getByText('Not showing now')).toBeVisible();
  await expect(row(page, 'Just in').getByText(/not showing now/i)).toHaveCount(0);
  // The switch stays on: the seller didn't turn it off.
  await expect(main(page).getByRole('switch', { name: 'Show Best sellers' })).toBeChecked();
  await expectAccessible(page);
});

test('says nothing when the storefront could not be asked', async ({ page }) => {
  await open(page, null);
  await expect(row(page, 'All products')).toBeVisible();
  await expect(main(page).getByText(/not showing now/i)).toHaveCount(0);
});

test("a row not showing says why atop its sheet, until it's changed (de-row-hidden)", async ({
  page,
}) => {
  await open(page, LEFT);
  await main(page).getByRole('button', { name: 'Open Best sellers' }).click();
  const sheet = page.getByRole('dialog').last();
  const note = sheet.getByRole('status');
  await expect(note).toContainText('This row is not showing now');
  await expect(note).toContainText(
    "With fewer than 4 products this row doesn't show; its products go to ‘All products’.",
  );
  await expectAccessible(page);
  // Changed in the sheet, the saved row's reason may no longer hold.
  await sheet.getByRole('radio', { name: 'Carousel (swipe)' }).click();
  await expect(note).toHaveCount(0);
});

test('a grid counts in whole lines of four; a carousel keeps 6 (de-row-grid)', async ({ page }) => {
  await open(page, { rows: [], items: [] });
  await main(page).getByRole('button', { name: 'Open Just in' }).click();
  const sheet = page.getByRole('dialog').last();
  const counts = sheet.getByRole('radiogroup', { name: 'How many' }).getByRole('radio');
  await expect(counts).toHaveText(['4', '6', '8', '12']);
  await expect(sheet.getByRole('radio', { name: '6' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: 'Grid' }).click();
  // The carousel's 6 becomes a grid's 4.
  await expect(counts).toHaveText(['4', '8', '12']);
  await expect(sheet.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet).toContainText('A grid shows whole lines of four.');
});

test('an own banner or slide leading nowhere says why, and the others say nothing (de-banner-hidden)', async ({
  page,
}) => {
  await open(page, LEFT);
  await main(page).getByRole('button', { name: 'Open Offer banners' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('button', { name: /Up to 30% off/ }).click();
  await expect(sheet.getByRole('status')).toContainText('The offer is over');
  await expect(sheet.getByRole('status')).toContainText('It shows again when an offer starts.');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Back' }).click();
  await sheet.getByRole('button', { name: /Gift sets/ }).click();
  await expect(sheet.getByRole('status')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await main(page).getByRole('button', { name: 'Open Hero slides' }).click();
  const hero = page.getByRole('dialog').last();
  await hero.getByRole('button', { name: /New lipsticks/ }).click();
  await expect(hero.getByRole('status')).toContainText('The offer is over');
});

test('a wide banner leading to an empty category says so (de-wide-empty)', async ({ page }) => {
  await open(page, LEFT);
  await main(page).getByRole('button', { name: 'Open Wide banner' }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('status')).toContainText('This category has no products now');
  await expect(sheet.getByRole('status')).toContainText('It shows again when products come.');
});

test('says it all in Bangla', async ({ page }) => {
  await open(page, LEFT, 'bn');
  await expect(row(page, 'সব প্রোডাক্ট')).toContainText(
    'সব সময় শেষে থাকে, বাকি সব প্রোডাক্ট এখানে',
  );
  await expect(row(page, 'সবচেয়ে বেশি বিক্রি').getByText('এখন দেখাচ্ছে না')).toBeVisible();
  await main(page).getByRole('button', { name: 'সবচেয়ে বেশি বিক্রি খুলুন' }).click();
  await expect(page.getByRole('dialog').last().getByRole('status')).toContainText(
    '4টার কম প্রোডাক্ট থাকলে এই সারি দেখাবে না; প্রোডাক্টগুলো ‘সব প্রোডাক্ট’-এ যাবে।',
  );
});
