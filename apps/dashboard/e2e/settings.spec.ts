import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnExports, drawnSettings } from './support/settings';

// TENANT-DASHBOARD-DESIGN §7.16, Slice 11.6: Settings -- its rows by permission and what comes later, Shop details with
// the name, logo, shop type and contact details, Brand identity until its editor, and Data export. Each test runs on a
// phone and on a desktop (playwright.config.ts).

// A one-pixel PNG, as a file the browser would send.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
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

test('lists the shop’s settings, and what comes later with its phase', async ({ page }) => {
  await open(page, '/settings');
  for (const [name, href] of [
    ['Shop details', '/settings/shop'],
    ['Delivery', '/delivery'],
    ['Brand identity', '/settings/brand'],
    ['Data export', '/settings/export'],
  ] as const) {
    await expect(main(page).getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
      'href',
      `/${SLUG}${href}`,
    );
  }
  await expect(main(page).getByText('Coming later')).toBeVisible();
  await expect(main(page).getByText('Arrives in Phase 6')).toBeVisible();
  await expect(main(page).getByText('Arrives in Slices 12 to 13')).toBeVisible();
  await expectAccessible(page);
});

test('staff who manage settings see them, and the export stays the owner’s', async ({ page }) => {
  await open(page, '/settings', { isOwner: false, permissions: ['settings:manage'] });
  await expect(main(page).getByRole('link', { name: /^Shop details/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^Data export/ })).toHaveCount(0);
});

test('Shop details shows what is saved and saves the name, contact and shop type at once', async ({
  page,
}) => {
  const log = await open(page, '/settings/shop');
  await expect(main(page).getByLabel('Shop name')).toHaveValue('Megh Fashion');
  await expect(main(page).getByLabel('Support phone')).toHaveValue('1711 234 567');
  await expect(main(page).getByLabel('What you mainly sell')).toHaveValue('clothing');
  await expect(main(page).getByLabel('Shop address')).toHaveValue('24/B, Mirpur 10, Dhaka 1216');
  // The shop's link, with the note that renaming never changes it.
  await expect(main(page).getByLabel('Shop link')).toHaveValue(`${SLUG}.lytro.app`);
  await expectAccessible(page);

  await main(page).getByLabel('Shop name').fill('Megh Fashion House');
  await main(page).getByLabel('Support phone').fill('1811 222 333');
  await main(page).getByLabel('Email').fill('hello@megh.example');
  await main(page).getByLabel('Shop address').fill('');
  await main(page).getByLabel('What you mainly sell').selectOption('cosmetics');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PATCH', '/shop-settings')).toEqual({
    shopName: 'Megh Fashion House',
    contactPhone: '+8801811222333',
    contactEmail: 'hello@megh.example',
    businessAddress: null,
  });
  expect(log.sent('PUT', '/business-type')).toEqual({ businessType: 'cosmetics' });
  // TEN-19: the dashboard follows the new name at once, without a reload; the shop's link unchanged.
  await page.getByRole('link', { name: 'Menu' }).filter({ visible: true }).first().click();
  await expect(main(page).getByText('Megh Fashion House', { exact: true })).toBeVisible();
  await expect(main(page).getByText(`${SLUG}.lytro.app`, { exact: false })).toBeVisible();
});

test('a support phone that is not a mobile number is not sent', async ({ page }) => {
  const log = await open(page, '/settings/shop');
  await main(page).getByLabel('Support phone').fill('1234');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByText('Enter a mobile number, like 1711 234 567.')).toBeVisible();
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);
});

test('an unchanged shop type is not sent again', async ({ page }) => {
  const log = await open(page, '/settings/shop');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.calls.some((call) => call.path === '/business-type')).toBe(false);
});

test('uploads a logo, prepared by the server, and shows it', async ({ page }) => {
  const log = await open(page, '/settings/shop');
  await main(page).getByLabel('Upload').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByRole('status')).toHaveText('Logo saved');
  expect(log.sent('POST', '/media/uploads')).toEqual({
    kind: 'image',
    contentType: 'image/png',
    bytes: PNG.length,
    purpose: 'shop_logo',
  });
  expect(log.calls.some((call) => call.path === '/media/m-logo/finish')).toBe(true);
  expect(log.sent('PUT', '/shop-settings/logo')).toEqual({ mediaId: 'm-logo' });
  await expect(main(page).locator('img').first()).toBeVisible();
});

test('a file that is not an image is turned away before it is sent', async ({ page }) => {
  const log = await open(page, '/settings/shop');
  await main(page)
    .getByLabel('Upload')
    .setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
  await expect(main(page).getByText('Use a JPEG, PNG or WebP image.')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/media/uploads')).toBe(false);
});

test('an image the server cannot use says so, and the logo stays', async ({ page }) => {
  const settings = drawnSettings('en');
  settings.upload = { refused: 'unreadable' };
  const log = await open(page, '/settings/shop', { settings });
  await main(page).getByLabel('Upload').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(main(page).getByText('The image could not be used. Try another one.')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/shop-settings/logo')).toBe(false);
});

test('Brand identity says its editor is coming, and offers the add-on now', async ({ page }) => {
  await open(page, '/settings/brand');
  await expect(main(page).getByText('Your logo, colours and fonts')).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'See the add-on' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons`,
  );
  await expectAccessible(page);
});

test('Data export lists each request in its state, and asks again', async ({ page }) => {
  const log = await open(page, '/settings/export', { money: { exports: drawnExports() } });
  await expect(main(page).getByText('20 Oct 2026 · 11:50')).toBeVisible();
  await expect(main(page).getByText('Preparing')).toBeVisible();
  await expect(main(page).getByText('CSV + JSON · 18 MB · lasts 24 hours')).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Download' })).toHaveAttribute(
    'href',
    '/api/v1/exports/export-2/download',
  );
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Failed, try again' }).click();
  await expect.poll(() => log.calls.filter((call) => call.method === 'POST').length).toBe(1);
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/exports')).toBe(true);
});

test('with no export yet, the owner asks for the first', async ({ page }) => {
  const log = await open(page, '/settings/export');
  await expect(main(page).getByText('No exports yet.', { exact: false })).toBeVisible();
  await main(page).getByRole('button', { name: 'Request an export' }).click();
  await expect(main(page).getByText('Preparing')).toBeVisible();
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/exports')).toBe(true);
});

test('staff reaching Data export are told it is the owner’s', async ({ page }) => {
  const log = await open(page, '/settings/export', {
    isOwner: false,
    permissions: ['settings:manage'],
  });
  await expect(main(page).getByText('Only the owner can download.')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Request an export' })).toHaveCount(0);
  expect(log.calls.some((call) => call.path === '/exports')).toBe(false);
});

test('Home’s logo item opens Shop details, where the logo is uploaded', async ({ page }) => {
  await open(page, '', DAY_ONE);
  await main(page).getByRole('link', { name: 'Upload your logo' }).click();
  await expect(page).toHaveURL(`/${SLUG}/settings/shop`);
  await expect(main(page).getByRole('button', { name: 'Upload' })).toBeVisible();
});
