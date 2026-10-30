import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { brandImage } from './support/brand';
import { mockApi, SLUG, type ShopState } from './support/mock-api';
import { indigoBrand, maroonBrand } from './support/themed';

// TENANT-DASHBOARD-DESIGN §7.28, Slice 11.12b (prototype Part 24): the dashboard in a shop's identity while it shows --
// the main colour's scale, the rail at Lytro's depth with the dark logo at its foot, the page behind white cards, the
// identity's faces with figures in Inter, the corner and spacing presets, the tab's icon and the browser bar's colour --
// with the status colours never changed (BRN-04), and Lytro's again the moment it is switched off. Each test runs on a
// phone and on a desktop.

const HELD = { usage: { owned: [{ key: 'brand_identity' }] } };
const WHITE = 'rgb(255, 255, 255)';
const SCALE = [
  '--color-brand-50',
  '--color-brand-100',
  '--color-brand-200',
  '--color-brand-300',
  '--color-brand-500',
  '--color-brand-800',
  '--color-brand-900',
  '--color-rail-on',
  '--color-rail-text',
  '--color-on-primary',
  '--color-accent-700',
  '--color-on-accent',
];

async function open(page: Page, path: string, state: ShopState): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(main(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

function main(page: Page) {
  return page.getByRole('main');
}

/** A computed style of an element. */
function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/** A variable as the document computes it, the identity's own when it sets one. */
function variable(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (each) => getComputedStyle(document.documentElement).getPropertyValue(each).trim(),
    name,
  );
}

function themeColour(page: Page): Promise<string | null> {
  return page.locator('meta[name="theme-color"]').getAttribute('content');
}

function iconLinks(page: Page): Promise<(string | null)[]> {
  return page
    .locator('link[rel="icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
}

function onDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('wears the identity: its colours, the page behind white cards, its faces with figures in Inter', async ({
  page,
}) => {
  await open(page, '', { brand: maroonBrand(), brandShows: true });
  expect(await variable(page, '--color-primary')).toBe('#7a1f2b');
  // The main colour's scale as Part 24 draws it: tints toward white, the hover a fifth toward black, the rail at the
  // depth of Lytro's; the accent's words in their nearest shade that reads on white.
  const scale: Record<string, string> = {};
  for (const name of SCALE) scale[name] = await variable(page, name);
  expect(scale).toEqual({
    '--color-brand-50': '#f7f2f2',
    '--color-brand-100': '#efe4e6',
    '--color-brand-200': '#dec7ca',
    '--color-brand-300': '#c39aa0',
    '--color-brand-500': '#a2626b',
    '--color-brand-800': '#621922',
    '--color-brand-900': '#621922',
    '--color-rail-on': '#723038',
    '--color-rail-text': '#e3d6d7',
    '--color-on-primary': '#ffffff',
    '--color-accent-700': '#9d6b0e',
    '--color-on-accent': '#10201f',
  });
  expect(await styleOf(page.locator('.bg-page').first(), 'background-color')).toBe(
    'rgb(251, 247, 240)',
  );
  const card = main(page).locator('.p-card').first();
  expect(await styleOf(card, 'background-color')).toBe(WHITE);
  expect(await styleOf(main(page).getByRole('heading').first(), 'font-family')).toMatch(
    /^Fraunces/,
  );
  expect(await styleOf(page.locator('.font-ui').first(), 'font-family')).toMatch(
    /^"Plus Jakarta Sans"/,
  );
  expect(await styleOf(main(page).locator('.num').first(), 'font-family')).toMatch(/^Inter/);
  expect(await themeColour(page)).toBe('#7a1f2b');
  // No square icon yet: the tab keeps Lytro's.
  expect(await iconLinks(page)).toEqual(['/favicon.ico', '/logo.svg']);
  if (onDesktop(page)) {
    const rail = page.getByRole('navigation', { name: 'Main navigation' });
    // The main colour taken down to the depth of Lytro's rail (#621922), its dark logo where the mark was.
    expect(await styleOf(rail, 'background-color')).toBe('rgb(98, 25, 34)');
    expect(await styleOf(rail.locator('[aria-current="page"]'), 'background-color')).toBe(
      'rgb(114, 48, 56)',
    );
    expect(await styleOf(rail.getByRole('link', { name: 'Orders' }), 'color')).toBe(
      'rgb(227, 214, 215)',
    );
    await expect(rail.getByRole('img', { name: 'Megh Fashion' })).toBeVisible();
  }
  await expectAccessible(page);
});

test('words in a main colour too light for them take its nearest shade that reads (BRN-03)', async ({
  page,
}) => {
  // Amber reaches 3:1 on its background, so it may be the main colour, but only 3.4:1 on white: its words take
  // #97610b, which reads on the page and on the tints words sit on.
  const amber = maroonBrand();
  amber.identity = {
    ...amber.identity,
    mainColor: '#c27c0e',
    accentColor: '#2d6a4f',
    backgroundColor: '#fffdf8',
    darkLogo: null,
  };
  await open(page, '/stock', { brand: amber, brandShows: true });
  const edit = main(page)
    .getByRole('button', { name: /^Edit: / })
    .first();
  expect(await styleOf(edit, 'color')).toBe('rgb(151, 97, 11)');
  const add = main(page).getByRole('button', { name: 'Add stock' }).first();
  expect(await styleOf(add, 'background-color')).toBe('rgb(194, 124, 14)');
  expect(await styleOf(add, 'color')).toBe('rgb(16, 32, 31)');
  if (onDesktop(page)) {
    // The person's initial on the pale tint: the words' shade, where brand-800 would read 4.41:1. The letter is
    // hidden from screen readers, so the accessibility check below does not weigh it.
    const initial = page.locator('span.rounded-full.bg-brand-100').first();
    expect(await styleOf(initial, 'color')).toBe('rgb(151, 97, 11)');
  }
  await expectAccessible(page);
});

test('takes the corner and spacing presets: round and airy, square and compact', async ({
  page,
}) => {
  await open(page, '', { brand: maroonBrand(), brandShows: true });
  const card = main(page).locator('.p-card').first();
  const copy = main(page).getByRole('button', { name: 'Copy' });
  const tiles = main(page).locator('.gap-tiles').first();
  // The page's own stack of sections: the section gap on a phone, the columns' from 640 px.
  const sections = main(page).locator(':scope > div').first();
  expect(await styleOf(card, 'border-radius')).toBe('16px');
  expect(await styleOf(card, 'padding')).toBe('20px');
  expect(await styleOf(copy, 'border-radius')).toBe('12px');
  expect(await styleOf(tiles, 'column-gap')).toBe('15px');
  expect(await styleOf(sections, 'row-gap')).toBe(onDesktop(page) ? '30px' : '20px');

  await open(page, '', { brand: indigoBrand(), brandShows: true });
  expect(await variable(page, '--color-primary')).toBe('#3b3fbf');
  expect(await styleOf(card, 'border-radius')).toBe('4px');
  expect(await styleOf(card, 'padding')).toBe('12px');
  expect(await styleOf(copy, 'border-radius')).toBe('3px');
  expect(await styleOf(tiles, 'column-gap')).toBe('9px');
  expect(await styleOf(sections, 'row-gap')).toBe(onDesktop(page) ? '18px' : '12px');
  expect(await styleOf(main(page).getByRole('heading').first(), 'font-family')).toMatch(/^Poppins/);
  await expectAccessible(page);
});

test('keeps "Powered by Lytro" with the identity on, as on every plan (TEN-18)', async ({
  page,
}) => {
  await open(page, '/menu', { brand: maroonBrand(), brandShows: true });
  await expect(main(page).getByText('Powered by Lytro')).toBeVisible();
});

test('never changes the status colours: tags, banners, a full seat bar (BRN-04)', async ({
  page,
}) => {
  const maroon = (more: ShopState = {}): ShopState => ({
    brand: maroonBrand(),
    brandShows: true,
    ...more,
  });
  await open(page, '/billing', maroon());
  const checking = main(page).locator('.bg-info-soft', { hasText: 'Being checked' }).first();
  const paid = main(page).locator('.bg-success-soft', { hasText: 'Paid' }).first();
  expect(await styleOf(checking, 'color')).toBe('rgb(14, 107, 102)');
  expect(await styleOf(checking, 'background-color')).toBe('rgb(221, 245, 242)');
  expect(await styleOf(paid, 'color')).toBe('rgb(27, 122, 67)');
  // A paid payment's invoice number is a heading of figures: Inter, not the heading pair.
  await main(page)
    .getByRole('link', { name: /renewal/ })
    .first()
    .click();
  const amount = main(page).locator('h2.num');
  expect(await styleOf(amount, 'font-family')).toMatch(/^Inter/);

  await open(page, '/balance', maroon());
  const pending = main(page).getByRole('status').filter({ hasText: '৳500' });
  expect(await styleOf(pending, 'color')).toBe('rgb(6, 59, 56)');

  await open(page, '', maroon({ home: { fastSpendAlertedAt: new Date().toISOString() } }));
  expect(await styleOf(main(page).getByRole('alert'), 'color')).toBe('rgb(154, 96, 4)');

  // A full team's seats in the warning's marigold, not the identity's accent (coral here).
  await open(page, '/team', { brand: indigoBrand(), brandShows: true });
  const seats = main(page).locator('.rounded-full.bg-neutral-100 > i');
  expect(await styleOf(seats, 'background-color')).toBe('rgb(242, 165, 22)');
});

test('switched off in the editor, the dashboard is Lytro’s again at once, the tab and bar too', async ({
  page,
}) => {
  const brand = maroonBrand();
  brand.identity.icon = brandImage('m-icon');
  await open(page, '/settings/brand', { brand, brandShows: true, ...HELD });
  expect(await variable(page, '--color-primary')).toBe('#7a1f2b');
  expect(await iconLinks(page)).toEqual([
    brand.identity.icon.urls.thumbnail,
    brand.identity.icon.urls.thumbnail,
  ]);
  await main(page).getByRole('switch', { name: 'Use my brand' }).click();
  await expect.poll(() => variable(page, '--color-primary')).toBe('#0e6b66');
  expect(await page.locator('html').getAttribute('data-corners')).toBeNull();
  expect(await themeColour(page)).toBe('#0e6b66');
  expect(await iconLinks(page)).toEqual(['/favicon.ico', '/logo.svg']);
  expect(await styleOf(page.locator('.bg-page').first(), 'background-color')).toBe(
    'rgb(246, 249, 248)',
  );
});
