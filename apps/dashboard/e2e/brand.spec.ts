import { deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { brandImage, drawnBrand, type BrandFixture } from './support/brand';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.28, Slice 11.12a (prototype Parts 17 and 23): the brand editor. The buttons follow the
// switch, the contrast check is the server's own (BRN-03), the fonts are the curated pairs, the dark logo and the icon
// upload as the shop logo does, and leaving with changes unsaved asks first. Each test runs on a phone and on a desktop.

const HELD = { usage: { owned: [{ key: 'brand_identity' }] } };

/** The prototype's identity, changed where a test needs it to be. */
function brand(
  change: Omit<Partial<BrandFixture>, 'identity'> & {
    identity?: Partial<BrandFixture['identity']>;
  } = {},
): BrandFixture {
  const drawn = drawnBrand();
  return { ...drawn, ...change, identity: { ...drawn.identity, ...change.identity } };
}

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/settings/brand`);
  await expect(main(page).getByRole('heading', { name: 'Logos' })).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

async function expectAccessible(page: Page): Promise<void> {
  // The pairs' "Aa" samples and the preview draw the colours as chosen, failing ones included: illustrations, which
  // the words and ratios beside them describe.
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('[data-sample]')
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

// A real PNG of a given size, as a file the browser would send: one grey row repeated (CRC-32 as PNG defines it).
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('shows the identity switched on with the add-on’s end, and saves a change at once', async ({
  page,
}) => {
  const log = await open(page, { brand: brand(), money: HELD });
  await expect(main(page).getByRole('switch', { name: 'Use my brand' })).toBeChecked();
  await expect(
    main(page).getByText(/^On across the storefront, landing pages and dashboard · add-on until/),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Apply' })).toHaveCount(0);
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Airy' }).click();
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved · your changes show within a minute' }),
  ).toBeVisible();
  const sent = log.sent('PUT', '/brand') as Record<string, unknown>;
  expect(sent).toMatchObject({ spacing: 'airy', mainColor: '#0f6e6a', darkLogoId: null });
  expect(sent).not.toHaveProperty('useBrand');
});

test('off: Apply saves and switches on; Save without switching on keeps it off', async ({
  page,
}) => {
  const log = await open(page, { brand: brand({ useBrand: false }), money: HELD });
  await expect(main(page).getByText('Off · everyone sees the Lytro default')).toBeVisible();
  await main(page).getByRole('button', { name: 'Save without switching on' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'your brand stays off until you switch it on' }),
  ).toBeVisible();
  expect(log.sent('PUT', '/brand')).not.toHaveProperty('useBrand');

  await main(page).getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your brand is on' })).toBeVisible();
  expect(log.sent('PUT', '/brand')).toMatchObject({ useBrand: true });
  // On now: one Save, and the switch on.
  await expect(main(page).getByRole('switch', { name: 'Use my brand' })).toBeChecked();
  await expect(main(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible();
});

test('the switch turns the brand off at once, keeping what the page has not saved; on again is Apply', async ({
  page,
}) => {
  const log = await open(page, { brand: brand(), money: HELD });
  await main(page).getByRole('button', { name: 'Compact' }).click();
  await main(page).getByRole('switch', { name: 'Use my brand' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your brand is off · everyone sees the Lytro default' }),
  ).toBeVisible();
  expect(log.sent('PUT', '/brand/switch')).toEqual({ useBrand: false });
  await expect(main(page).getByRole('button', { name: 'Compact' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await main(page).getByRole('switch', { name: 'Use my brand' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your brand is on' })).toBeVisible();
  expect(log.sent('PUT', '/brand')).toMatchObject({ useBrand: true, spacing: 'compact' });
});

test('a pale main colour fails the check: Apply is off until Use takes the nearest passing shade', async ({
  page,
}) => {
  await open(page, { brand: brand({ useBrand: false }), money: HELD });
  await main(page).getByRole('button', { name: /^Main/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Main colour' });
  await sheet.getByLabel('Colour code').fill('#F2D16B');
  await expect(sheet.getByText('On the background')).toBeVisible();
  await expect(sheet.getByText('1.3:1 ✗')).toBeVisible();
  await expect(sheet.getByText('needs 3:1')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect(main(page).getByText('Some colours are hard to read together.')).toBeVisible();
  await expect(main(page).getByText('Main colour on background')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Apply' })).toBeDisabled();
  await expect(main(page).getByRole('switch', { name: 'Use my brand' })).toBeDisabled();
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Use #a08a47' }).click();
  await expect(main(page).getByRole('button', { name: /^Main #a08a47/ })).toBeVisible();
  await expect(main(page).getByText('Main colour on background')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Apply' })).toBeEnabled();
});

test('a colour from the sheet’s list shows in the preview at once, saved only on Save', async ({
  page,
}) => {
  const log = await open(page, { brand: brand(), money: HELD });
  await main(page)
    .getByRole('button', { name: /^Accent/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Accent colour' });
  await sheet.getByRole('button', { name: '#38a3d1' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  const preview = main(page).locator('[style*="--ba"]');
  await expect(preview).toHaveAttribute('style', /--ba: #38a3d1/);
  expect(log.calls.some((call) => call.method === 'PUT')).toBe(false);

  await main(page).getByRole('button', { name: 'Dashboard' }).click();
  await expect(preview.getByText('7 orders today')).toBeVisible();

  // BRN-06: the main colour too, on the landing page's preview, and still nothing saved.
  await main(page).getByRole('button', { name: 'Landing' }).click();
  await main(page).getByRole('button', { name: /^Main/ }).click();
  const main_ = page.getByRole('dialog', { name: 'Main colour' });
  await main_.getByRole('button', { name: '#1d4ed8' }).click();
  await main_.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).locator('[style*="--bm"]').first()).toHaveAttribute(
    'style',
    /--bm: #1d4ed8/,
  );
  expect(log.calls.some((call) => call.method === 'PUT')).toBe(false);
});

test('headings take any of the seven pairs; body text leaves out the one for headings only', async ({
  page,
}) => {
  await open(page, { brand: brand(), money: HELD });
  await main(page).getByRole('button', { name: 'Change' }).nth(1).click();
  const headings = page.getByRole('dialog', { name: 'Font for headings' });
  await expect(headings.getByRole('radio')).toHaveCount(7);
  await headings.getByRole('radio', { name: /^Galada \+ Playfair Display/ }).click();
  await headings.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByText('Galada + Playfair Display', { exact: true })).toBeVisible();

  await main(page).getByRole('button', { name: 'Change' }).nth(2).click();
  const body = page.getByRole('dialog', { name: 'Font for body text' });
  await expect(body.getByRole('radio')).toHaveCount(6);
  await expect(body.getByText(/is for headings only/)).toBeVisible();
});

test('the square icon is checked before it is sent, and a fit one uploads and saves', async ({
  page,
}) => {
  const log = await open(page, { brand: brand(), money: HELD });
  const icon = page.getByLabel('Square icon', { exact: true });
  await icon.setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: png(800, 450) });
  await expect(
    main(page).getByText('The icon must be square, at least 512 × 512 px. This one is 800 × 450.'),
  ).toBeVisible();
  expect(log.calls.some((call) => call.path === '/media/uploads')).toBe(false);

  await icon.setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: png(512, 512) });
  // Once it is ready the icon's tile says Change (the light logo's, the icon's and the two fonts').
  await expect(main(page).getByRole('button', { name: 'Change' })).toHaveCount(4);
  await expect(main(page).getByRole('button', { name: 'Upload' })).toHaveCount(1);
  expect(log.sent('POST', '/media/uploads')).toMatchObject({ purpose: 'shop_logo' });
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  expect(log.sent('PUT', '/brand')).toMatchObject({ iconId: 'm-logo', darkLogoId: null });
});

test('a set dark logo opens its sheet, and Remove takes effect on Save', async ({ page }) => {
  const log = await open(page, {
    brand: brand({ identity: { darkLogo: brandImage('m-dark'), icon: brandImage('m-icon') } }),
    money: HELD,
  });
  await main(page).getByRole('button', { name: 'Change' }).nth(1).click();
  const sheet = page.getByRole('dialog', { name: 'Logo for dark backgrounds' });
  await expect(sheet.getByRole('button', { name: 'Replace' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Remove' }).click();
  await expect(main(page).getByRole('button', { name: 'Upload' })).toHaveCount(1);
  expect(log.calls.some((call) => call.method === 'PUT')).toBe(false);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  expect(log.sent('PUT', '/brand')).toMatchObject({ darkLogoId: null, iconId: 'm-icon' });
});

test('leaving with changes unsaved asks first', async ({ page }) => {
  await open(page, { brand: brand(), money: HELD });
  await main(page).getByRole('button', { name: 'Round', exact: true }).click();
  await main(page).getByRole('button', { name: 'Change' }).first().click();
  const ask = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(
    ask.getByText('Your changes to the brand identity are not saved yet.'),
  ).toBeVisible();
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/brand$`));
  await expect(main(page).getByRole('button', { name: 'Round', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The light logo's Change leads to Shop details, where the shop logo is.
  await main(page).getByRole('button', { name: 'Change' }).first().click();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/shop$`));
});

test('the trial designs and saves, but cannot switch on', async ({ page }) => {
  const log = await open(page, {
    state: 'trial',
    brand: brand({ useBrand: false, allowed: false }),
  });
  await expect(
    main(page).getByText(
      /^On the trial you can design, preview and save your brand\. .*\(৳149\/month\)/,
    ),
  ).toBeVisible();
  await expect(main(page).getByRole('switch', { name: 'Use my brand' })).toBeDisabled();
  await expect(main(page).getByText('Buy the add-on to switch on')).toBeVisible();
  await main(page).getByRole('button', { name: 'Save without switching on' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'you can switch it on once you have the add-on' }),
  ).toBeVisible();
  expect(log.sent('PUT', '/brand')).not.toHaveProperty('useBrand');
});

test('without the add-on the banner offers it; with the plan’s feature the line says so', async ({
  page,
}) => {
  await open(page, { brand: brand({ useBrand: false, allowed: false }) });
  await expect(main(page).getByRole('link', { name: 'Buy the add-on' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?buy=brand_identity`,
  );
  await expectAccessible(page);

  await open(page, { brand: brand() });
  await expect(
    main(page).getByText(
      'On across the storefront, landing pages and dashboard · included in your plan',
    ),
  ).toBeVisible();
});

test('after a lapse: the default shows, Buy again with the price, and the page still saves', async ({
  page,
}) => {
  const log = await open(page, { brand: brand({ allowed: false }) });
  await expect(main(page).getByText(/^The brand add-on has ended/)).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Buy again', exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Buy again · ৳149/month' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?buy=brand_identity`,
  );
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'this shows again when you buy the add-on' }),
  ).toBeVisible();
  expect(log.sent('PUT', '/brand')).not.toHaveProperty('useBrand');
});
