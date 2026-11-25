import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { burka, withBurka } from './support/designs';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { productOrders } from './support/orders';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.4c (the owner, 2026-11-25; the sketch's `pl-share-*` and `pd-*`): a product row opens the
// product's page and its share icon the share sheet -- the link with Copy, Share and See, a design's link, the shop's
// link, and a shop not open yet told when it opens; the page with its photos, stock (or each design's by size), recent
// orders, link, last 30 days, and Edit, Share and more; made to order; archived. Each test runs on a phone and a desktop.

/** The clipboard as the page gets it, and the phone's own share where `share` is on, whatever the browser allows. */
async function open(
  page: Page,
  path: string,
  state: ShopState = {},
  share = false,
): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.addInitScript((withShare: boolean) => {
    const copied: string[] = [];
    const shared: unknown[] = [];
    Object.assign(window, { copied, shared });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: withShare
        ? (data: unknown) => {
            shared.push(data);
            return Promise.resolve();
          }
        : undefined,
    });
  }, share);
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');
const toast = (page: Page) => page.getByRole('status').filter({ hasText: /./ });
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied: string[] }).copied);
const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);
const isPhone = () => test.info().project.name === 'phone';

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

/** Nothing wider than the screen: no page scrolling sideways at a phone's width. */
async function expectNoSideways(page: Page): Promise<void> {
  const [wide, view] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(wide).toBeLessThanOrEqual(view);
}

/** The shop with the T-shirt's video, the saree made to order, and the T-shirt's four orders of the day. */
function shop(): ShopState {
  const products = drawnProducts();
  const shirt = products.products.find((each) => each.id === 'p-1');
  if (shirt) shirt.videoId = 'm-9';
  const saree = products.products.find((each) => each.id === 'p-3');
  if (saree) saree.stockTracking = 'not_tracked';
  return { products, orders: productOrders('p-1') };
}

test('a row opens the product page; its share icon opens the share sheet (pl-share-row, pl-share-sheet)', async ({
  page,
}) => {
  await open(page, '/products', shop());
  await main(page)
    .getByRole('link', { name: /Cotton T-shirt/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/products/p-1`);
  await page.goBack();

  await main(page).getByRole('button', { name: 'Share the link of Cotton T-shirt' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const share = page.getByRole('dialog', { name: 'Share the link' });
  await expect(share.getByTestId('share-link')).toHaveText('megh.lytro.app/l/p-1');
  await expect(share.getByRole('link', { name: 'See the page' })).toHaveAttribute(
    'href',
    'https://megh.lytro.app/l/p-1',
  );
  // No designs, so no design links; the shop's own link below.
  await expect(share.getByRole('radiogroup')).toHaveCount(0);
  await expect(share.getByRole('heading', { name: 'Your shop link' })).toBeVisible();
  await expectAccessible(page);
  await expectNoSideways(page);
});

test('Copy says Copied for a moment with a toast; with no phone share, WhatsApp, Facebook and Messenger (pl-share-copied)', async ({
  page,
}) => {
  const log = await open(page, '/products', shop());
  await main(page).getByRole('button', { name: 'Share the link of Cotton T-shirt' }).click();
  const share = page.getByRole('dialog', { name: 'Share the link' });
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(share.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(toast(page)).toHaveText('Link copied');
  expect(await copied(page)).toEqual(['https://megh.lytro.app/l/p-1']);
  // SUP-01: a copy ticks the checklist's "link shared".
  await expect
    .poll(() =>
      log.calls.some((call) => call.method === 'POST' && call.path === '/home/link-shared'),
    )
    .toBe(true);
  await expect(share.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 4000 });

  await expect(share.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
  const fallback = share.getByTestId('share-fallback');
  await expect(fallback.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    `https://wa.me/?text=${encodeURIComponent('https://megh.lytro.app/l/p-1')}`,
  );
  await expect(fallback.getByRole('link', { name: 'Facebook' })).toBeVisible();
  await expect(fallback.getByRole('link', { name: 'Messenger' })).toBeVisible();
});

test('the phone’s own share gets the link and the name', async ({ page }) => {
  await open(page, '/products', shop(), true);
  await main(page).getByRole('button', { name: 'Share the link of Cotton T-shirt' }).click();
  const share = page.getByRole('dialog', { name: 'Share the link' });
  await share.getByRole('button', { name: 'Share', exact: true }).click();
  await expect
    .poll(() => shared(page))
    .toEqual([{ title: 'Cotton T-shirt', url: 'https://megh.lytro.app/l/p-1' }]);
  await expect(share.getByTestId('share-fallback')).toHaveCount(0);
});

test('an inactive product’s icon is greyed and says why; an archived one has none', async ({
  page,
}) => {
  await open(page, '/products', shop());
  const hoodie = main(page).getByRole('button', { name: 'Share it once it is active' });
  await expect(hoodie).toHaveAttribute('aria-disabled', 'true');
  // Greyed, not dead: a tap says why (Playwright clicks an aria-disabled button only when forced).
  await hoodie.click({ force: true });
  await expect(toast(page)).toHaveText('Share it once it is active');
  await expect(sheet(page)).toHaveCount(0);

  await page.goto(`/${SLUG}/products?seg=archived`);
  await expect(main(page).getByRole('link', { name: /Linen panjabi/ })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /Share/ })).toHaveCount(0);
});

test('a product with designs shares the whole product or one design (pl-share-design)', async ({
  page,
}) => {
  await open(page, '/products', { products: withBurka() });
  await main(page).getByRole('button', { name: 'Share the link of Irani burka' }).click();
  const share = page.getByRole('dialog', { name: 'Share the link' });
  const designs = share.getByRole('radiogroup');
  await expect(designs.getByRole('radio', { name: 'Whole product' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(share.getByTestId('share-link')).toHaveText('megh.lytro.app/l/p-burka');
  await designs.getByRole('radio', { name: 'Stripe' }).click();
  await expect(designs.getByRole('radio', { name: 'Stripe' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(share.getByTestId('share-link')).toHaveText('megh.lytro.app/l/p-burka?d=d-2');
  await share.getByRole('button', { name: 'Copy link' }).click();
  expect(await copied(page)).toEqual(['https://megh.lytro.app/l/p-burka?d=d-2']);
  await expectAccessible(page);
});

test('a shop not open yet still shows the link, and when it opens (pl-share-paused)', async ({
  page,
}) => {
  await open(page, '/products', { ...shop(), state: 'pay_as_you_go', fairUse: { paused: true } });
  await main(page).getByRole('button', { name: 'Share the link of Cotton T-shirt' }).click();
  const share = page.getByRole('dialog', { name: 'Share the link' });
  await expect(share).toContainText('The link opens once a ৳10 top-up opens the shop.');
  await expect(share.getByTestId('share-link')).toHaveText('megh.lytro.app/l/p-1');
  await share.getByRole('link', { name: 'Top up' }).click();
  await expect(page).toHaveURL(`/${SLUG}/balance?topup=1&amount=10`);
});

test('the product page: photos and video, price, stock, recent orders, link and last 30 days (pd-detail)', async ({
  page,
}) => {
  const log = await open(page, '/products/p-1', shop());
  await expect(main(page).getByRole('heading', { name: 'Cotton T-shirt', level: 1 })).toBeVisible();
  await expect(main(page).getByText('Active', { exact: true })).toBeVisible();
  await expect(main(page)).toContainText('T-shirts');
  await expect(main(page).getByTestId('pd-photos')).toContainText('First photo');
  await expect(main(page).getByTestId('pd-photos')).toContainText('Video · 0:42');
  await expect(main(page).getByRole('region', { name: 'Stock', exact: true })).toBeVisible();
  // The three newest of its four orders, each opening the order.
  const recent = main(page).getByRole('link', { name: /৳/ });
  await expect(recent).toHaveCount(3);
  expect(
    log.calls.some((call) => call.path === '/orders' && call.query.includes('productId=p-1')),
  ).toBe(true);
  await expect(main(page).getByRole('heading', { name: 'Product link' })).toBeVisible();
  await expect(main(page).getByText('megh.lytro.app/l/p-1')).toBeVisible();
  await expect(main(page).getByTestId('pd-sales')).toContainText('pieces sold');
  await expect(main(page).getByRole('link', { name: 'See sales' })).toHaveAttribute(
    'href',
    new RegExp(`^/${SLUG}/sales/p-1\\?name=Cotton`),
  );
  // A phone has Edit, Share and More at its foot; a desktop at its head.
  await expect(main(page).getByRole('link', { name: 'Edit' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'More' })).toBeVisible();
  await expectAccessible(page);
  await expectNoSideways(page);

  await main(page).getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products/p-1/edit`);
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Cotton T-shirt');
  if (isPhone()) {
    // The editor's back returns to the product's page.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(`/${SLUG}/products/p-1`);
  }
});

test('See all lists the product’s orders, with a chip that clears it', async ({ page }) => {
  const log = await open(page, '/products/p-1', shop());
  await main(page).getByRole('link', { name: 'See all' }).click();
  await expect(page).toHaveURL(/\/orders\?.*product=p-1/);
  const chip = main(page).getByRole('button', { name: /Orders of Cotton T-shirt/ });
  await expect(chip).toBeVisible();
  await expect
    .poll(() =>
      log.calls.filter((call) => call.path === '/orders' && call.query.includes('productId=p-1')),
    )
    .not.toHaveLength(0);
  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(page).not.toHaveURL(/product=/);
});

test('several designs show each design’s count by size (pd-detail-designs)', async ({ page }) => {
  await open(page, '/products/p-burka', { products: withBurka(burka()) });
  const grid = main(page).getByTestId('pd-grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('thead th')).toHaveText(['', '54', '56']);
  await expect(grid.getByRole('row')).toHaveCount(3);
  await expect(grid.getByRole('cell')).toHaveText(['3', '0', '2', '5']);
  await expect(grid.getByRole('img', { name: 'Stripe' })).toBeVisible();
  await expect(main(page).getByText(/^Red: sold out. Amber: low./)).toBeVisible();
  await expect(main(page).getByTestId('pd-photos')).toContainText('Design 1');
  await expectAccessible(page);
  await expectNoSideways(page);
});

test('made to order counts no stock (pd-made)', async ({ page }) => {
  await open(page, '/products/p-3', shop());
  await expect(main(page).getByRole('heading', { name: 'Silk saree', level: 1 })).toBeVisible();
  await expect(main(page)).toContainText('Made to order');
  await expect(main(page)).toContainText(
    'Made to order: no stock is counted, orders are always taken.',
  );
  await expect(main(page).getByRole('button', { name: 'Add stock' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /Stock history/ })).toHaveCount(0);
});

test('More: Duplicate opens the copy to edit (pd-menu)', async ({ page }) => {
  await open(page, '/products/p-1', shop());
  await main(page).getByRole('button', { name: 'More' }).click();
  const menu = page.getByRole('dialog', { name: 'Cotton T-shirt' });
  await expect(menu.getByRole('link', { name: 'See in the shop' })).toHaveAttribute(
    'href',
    'https://megh.lytro.app/l/p-1',
  );
  await expect(menu.getByRole('button', { name: /Archive/ })).toBeVisible();
  await expectAccessible(page);
  await menu.getByRole('button', { name: /Duplicate/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-new-\\d+/edit$`));
  await expect(toast(page)).toHaveText('Copied · inactive until you turn it on');
});

test('More: Delete asks first, as the editor does, then back to the list (pd-delete)', async ({
  page,
}) => {
  const log = await open(page, '/products/p-1', shop());
  await main(page).getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('dialog', { name: 'Cotton T-shirt' })
    .getByRole('button', { name: 'Delete' })
    .click();
  const ask = page.getByRole('dialog', { name: 'Remove this product?' });
  await expect(ask.getByRole('radio', { name: /Delete for good/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await ask.getByRole('button', { name: 'Delete for good' }).last().click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect(toast(page)).toHaveText('Cotton T-shirt deleted');
  expect(log.calls.some((call) => call.method === 'DELETE' && call.query === '?hard=true')).toBe(
    true,
  );
});

test('Share on the page opens the same sheet (pd-share)', async ({ page }) => {
  await open(page, '/products/p-1', shop());
  await main(page).getByRole('button', { name: 'Share', exact: true }).first().click();
  const share = page.getByRole('dialog', { name: 'Share the link' });
  await expect(share.getByTestId('share-link')).toHaveText('megh.lytro.app/l/p-1');
});

test('an archived product shows its archived page, with Restore (pd-archived)', async ({
  page,
}) => {
  await open(page, '/products/p-7', shop());
  await expect(main(page).getByText('This product is archived')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'More' })).toHaveCount(0);
});

test('someone who may only read products sees the page with no actions and no orders', async ({
  page,
}) => {
  await open(page, '/products/p-1', {
    ...shop(),
    isOwner: false,
    permissions: ['products:read'],
  });
  await expect(main(page).getByRole('heading', { name: 'Cotton T-shirt', level: 1 })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'More' })).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Recent orders' })).toHaveCount(0);
  await expect(main(page).getByTestId('pd-sales')).toHaveCount(0);
});
