import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.23, Slice 11.7a: a product's photos and video -- uploads with their progress joining the
// photos, the media sheet with the cover, reordering by keyboard, removing (deleted when nothing else shows it, agreed
// 2026-10-27), the video with its length and size, refusals on their tile, storage full, a new product's photos in one
// request, and what a visit uploaded and left unsaved deleted on leaving. Each test runs on a phone and on a desktop.

const MB = 1024 * 1024;

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog', { name: 'Photos and video' });
}

function save(page: Page) {
  return main(page).getByRole('button', { name: /^(Save|Fix \d+ things? to save)$/ });
}

function toast(page: Page) {
  return page.getByRole('status').filter({ hasText: /Saved/ });
}

/** A picture or clip the browser sends, of the given size. */
function file(name: string, mimeType: string, bytes = 2048) {
  return { name, mimeType, buffer: Buffer.alloc(bytes, 1) };
}

/** Basics' own file fields (the sheet has its own). */
function stripInput(page: Page, kind: 'image' | 'video') {
  return main(page).locator(`input[type=file][accept^="${kind}"]`).first();
}

function sentBodies(log: ApiLog, method: string, path: string): unknown[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body);
}

function deleted(log: ApiLog): string[] {
  return log.calls
    .filter((call) => call.method === 'DELETE' && call.path.startsWith('/media/'))
    .map((call) => call.path.slice('/media/'.length));
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

test('adds photos, which join the photos in order, and one Save sends them', async ({ page }) => {
  const log = await open(page, 'p-1');
  await stripInput(page, 'image').setInputFiles([
    file('a.png', 'image/png'),
    file('b.jpg', 'image/jpeg'),
  ]);
  await expect(main(page).getByRole('button', { name: 'Photo 5' })).toBeVisible();
  await save(page).click();
  await expect(toast(page)).toBeVisible();
  const [sent] = sentBodies(log, 'PUT', '/products/p-1/images') as { mediaIds: string[] }[];
  expect(sent?.mediaIds.slice(0, 3)).toEqual(['m-1', 'm-2', 'm-3']);
  expect(sent?.mediaIds.slice(3)).toEqual([
    expect.stringMatching(/^m-up-/),
    expect.stringMatching(/^m-up-/),
  ]);
});

test('the media sheet: the cover, storage with this product’s share, reordering by keyboard', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  await expect(sheet(page).getByText('Cover', { exact: true })).toBeVisible();
  await expect(
    sheet(page).getByText('Storage: 0.2 GB of 2 GB · this product 2.3 MB'),
  ).toBeVisible();
  await expect(
    sheet(page).getByText(
      'Drag to reorder; the first is the cover. Up to 50 photos and one video.',
    ),
  ).toBeVisible();
  await expectAccessible(page);

  await sheet(page).getByRole('button', { name: 'Move photo 2', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(toast(page)).toBeVisible();
  expect(sentBodies(log, 'PUT', '/products/p-1/images')).toEqual([
    { mediaIds: ['m-2', 'm-1', 'm-3'] },
  ]);
});

test('removing a photo deletes it once nothing else shows it, and keeps one a copy shares', async ({
  page,
}) => {
  const products = drawnProducts();
  // A copy of the T-shirt shares its second photo (PRD-18).
  const [shirt] = products.products;
  if (shirt) products.products.push({ ...shirt, id: 'p-9', imageIds: ['m-2'] });
  const log = await open(page, 'p-1', { products });
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  await sheet(page).getByRole('button', { name: 'Remove photo 3', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Remove photo 2', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(toast(page)).toBeVisible();
  expect(sentBodies(log, 'PUT', '/products/p-1/images')).toEqual([{ mediaIds: ['m-1'] }]);
  await expect.poll(() => deleted(log)).toEqual(['m-3']);
});

test('adds a video, shown with its length and size, and Remove takes it off', async ({ page }) => {
  const log = await open(page, 'p-1');
  await stripInput(page, 'video').setInputFiles(file('clip.mp4', 'video/mp4', 3 * MB));
  await expect(main(page).getByRole('button', { name: 'Video' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Add video' })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Video' }).click();
  await expect(sheet(page).getByText('Video · 0:42 · 3 MB')).toBeVisible();
  await expect(sheet(page).getByText('Poster: first frame')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(toast(page)).toBeVisible();
  const [sent] = sentBodies(log, 'PUT', '/products/p-1/video') as { mediaId: string }[];
  expect(sent?.mediaId).toMatch(/^m-up-/);

  await main(page).getByRole('button', { name: 'Video' }).click();
  await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect
    .poll(() => sentBodies(log, 'PUT', '/products/p-1/video').at(-1))
    .toEqual({
      mediaId: null,
    });
});

test('a photo over the limit says so on its tile', async ({ page }) => {
  await open(page, 'p-1');
  await stripInput(page, 'image').setInputFiles(file('big.jpg', 'image/jpeg', 6 * MB));
  await expect(
    main(page).getByRole('alert').filter({ hasText: '6 MB · limit 5 MB' }),
  ).toBeVisible();
  await main(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(main(page).getByText('6 MB · limit 5 MB')).toHaveCount(0);
});

test('storage full says so, with what to do', async ({ page }) => {
  const products = { ...drawnProducts(), storage: { full: true, usedBytes: 2048 * MB } };
  await open(page, 'p-1', { products });
  await stripInput(page, 'image').setInputFiles(file('a.png', 'image/png'));
  await expect(main(page).getByRole('alert').first()).toContainText(
    'Storage is full: 2 GB of 2 GB. The upload was refused. Delete old photos.',
  );
  await expectAccessible(page);
});

test('a new product with its photo is saved in one request', async ({ page }) => {
  const log = await open(page, 'new');
  await stripInput(page, 'image').setInputFiles(file('a.png', 'image/png'));
  await expect(main(page).getByRole('button', { name: 'Photo 1' })).toBeVisible();
  await main(page).getByLabel('Name', { exact: true }).fill('Kurta');
  await main(page).getByLabel('Price', { exact: true }).fill('900');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const [sent] = sentBodies(log, 'POST', '/products') as { imageIds: string[] }[];
  expect(sent?.imageIds).toEqual([expect.stringMatching(/^m-up-/)]);
  expect(deleted(log)).toEqual([]);
});

test('leaving deletes what this visit uploaded and did not save', async ({ page }) => {
  const log = await open(page, 'p-1');
  await stripInput(page, 'image').setInputFiles(file('a.png', 'image/png'));
  await expect(main(page).getByRole('button', { name: 'Photo 4' })).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(`/${SLUG}`);
  await expect.poll(() => deleted(log)).toEqual([expect.stringMatching(/^m-up-/)]);
});

test('a refused photos part is named, the rest saved', async ({ page }) => {
  const products = { ...drawnProducts(), refuse: { images: true } };
  const log = await open(page, 'p-1', { products });
  await main(page).getByLabel('Name', { exact: true }).fill('Cotton tee');
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  await sheet(page).getByRole('button', { name: 'Remove photo 3', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(main(page).getByRole('alert').first()).toHaveText(
    'The photos were not saved. Storage is full: 2 of 2 GB. Everything else was saved.',
  );
  expect(sentBodies(log, 'PATCH', '/products/p-1')).toEqual([{ name: 'Cotton tee' }]);
  // The photo stays until its part is saved.
  expect(deleted(log)).toEqual([]);
});

test('deleting a product for good deletes the photos nothing else shows', async ({ page }) => {
  const log = await open(page, 'p-1');
  await main(page).getByText('More settings').click();
  await main(page).getByRole('button', { name: 'Delete for good' }).click();
  await page
    .getByRole('dialog', { name: 'Remove this product?' })
    .getByRole('button', { name: 'Delete for good' })
    .last()
    .click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect.poll(() => deleted(log).sort()).toEqual(['m-1', 'm-2', 'm-3']);
});
