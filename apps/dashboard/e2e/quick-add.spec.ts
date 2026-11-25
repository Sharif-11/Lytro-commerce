import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { openQuickMore } from './support/quick-add';

// TENANT-DASHBOARD-DESIGN §7.4b (the sketch's `pq-*`, approved by the owner 2026-11-25): a new product's quick add --
// photos as designs with each photo's menu, name and price, one stock box shared by default with the split a tap away,
// no silent 0, sizes from a sheet, আরও সেটিংস under the card, the fee on top, the combo one link away, and after the
// first save the landing link to copy, share or open, with the shop's own under it (`pq-saved`). A brand-new shop lands
// here from onboarding with a welcome line (`pq-first`). Each test runs on a phone and on a desktop.

/** Browser features the page may lack: the clipboard as the page gets it, and the phone's share sheet or none. */
async function open(
  page: Page,
  path = '/products/new',
  state: ShopState = {},
  share: 'none' | 'native' = 'none',
): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.addInitScript((withShare) => {
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
  }, share === 'native');
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const save = (page: Page) =>
  main(page)
    .getByRole('button', { name: /^(Save|Fix \d+ things? to save)$/ })
    .first();
const stockBox = (page: Page) => main(page).getByLabel('Stock', { exact: true });
const savedSheet = (page: Page) => page.getByRole('dialog', { name: /Product saved/ });
const payg = (balance: string, extra: ShopState = {}): ShopState => ({
  state: 'pay_as_you_go',
  money: { balance },
  ...extra,
});

/** A file the browser sends. */
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.alloc(2048, 1) });

async function addPhotos(page: Page, count: number): Promise<void> {
  await main(page)
    .locator('input[type=file][accept^="image"]')
    .first()
    .setInputFiles(Array.from({ length: count }, (_, at) => file(`photo-${String(at + 1)}.png`)));
  await expect(
    main(page).getByRole('button', { name: `Photo ${String(count)}`, exact: true }),
  ).toBeVisible();
}

async function named(page: Page, name = 'Panjabi', price = '1250'): Promise<void> {
  await main(page).getByLabel('Name', { exact: true }).fill(name);
  await main(page).getByLabel('Price', { exact: true }).fill(price);
}

function created(log: ApiLog): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === 'POST' && call.path === '/products')
    .map((call) => call.body as Record<string, unknown>);
}

async function pickSizes(page: Page, sizes: string[], typed?: string): Promise<void> {
  await main(page).getByRole('button', { name: 'Add sizes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add sizes' });
  for (const size of sizes) await sheet.getByRole('button', { name: size, exact: true }).click();
  if (typed) {
    await sheet.getByLabel('Another size').fill(typed);
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  }
  const count = sizes.length + (typed ? 1 : 0);
  await sheet
    .getByRole('button', { name: `Add ${String(count)} size${count === 1 ? '' : 's'}` })
    .click();
  await expect(sheet).toBeHidden();
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

/** Nothing wider than the screen: no sideways scroll at a phone's width. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
}

test('pq-empty: photos, name, price, one stock box and sizes on one card; more settings closed; the combo a link', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText('Photos · Video')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Add photo' })).toBeVisible();
  await expect(main(page).getByLabel('Name', { exact: true })).toBeVisible();
  await expect(main(page).getByLabel('Price', { exact: true })).toBeVisible();
  await expect(stockBox(page)).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Add sizes' })).toBeVisible();
  await expect(main(page).getByLabel('Description (optional)')).toBeVisible();
  // Gone from a new product's first screen: the kind question, the shop type's table and the old price.
  await expect(main(page).getByRole('radio', { name: 'Combo pack' })).toHaveCount(0);
  await expect(main(page).getByText('What this shop type sets')).toHaveCount(0);
  await expect(main(page).getByLabel(/old price/i)).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^More settings/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(main(page).getByRole('button', { name: 'Making a combo pack?' })).toBeVisible();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
});

test('no silent 0: an empty box is asked for; Save with 0 saves, and the saved sheet follows', async ({
  page,
}) => {
  const log = await open(page);
  await named(page);
  await save(page).click();
  await expect(save(page)).toHaveText('Fix 1 thing to save');
  await expect(main(page)).toContainText(
    'Write the stock. At 0 the shop shows “Out of stock” and nobody can order.',
  );
  expect(created(log)).toHaveLength(0);
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Save with 0' }).click();
  await save(page).click();
  await expect(savedSheet(page)).toBeVisible();
  expect(created(log)).toHaveLength(1);
  expect(created(log)[0]).toMatchObject({ name: 'Panjabi', stockTracking: 'tracked' });
});

test('made to order from the warning: the box leaves the card and nothing of stock is sent', async ({
  page,
}) => {
  const log = await open(page);
  await named(page);
  await save(page).click();
  await main(page).getByRole('button', { name: 'Turn on made to order' }).click();
  await expect(main(page)).toContainText(
    'Made to order (more settings), so there is no stock to count.',
  );
  await expect(stockBox(page)).toHaveCount(0);
  await openQuickMore(page);
  await expect(main(page).getByRole('switch', { name: /Made to order/ })).toBeChecked();
  await save(page).click();
  await expect(savedSheet(page)).toBeVisible();
  const [body] = created(log);
  expect(body).toMatchObject({ stockTracking: 'not_tracked' });
  expect(body).not.toHaveProperty('sharedOpeningStock');
  expect(body).not.toHaveProperty('openingStock');
});

test('sizes from the sheet share one stock box, a pack of one each (INV-24)', async ({ page }) => {
  const log = await open(page);
  await named(page, 'Cotton polo', '650');
  await pickSizes(page, ['S', 'M', 'L'], '3XL');
  for (const size of ['S', 'M', 'L', '3XL']) {
    await expect(main(page).getByRole('button', { name: `Remove ${size}` })).toBeVisible();
  }
  await expect(main(page)).toContainText('All sizes together');
  await expect(main(page).getByRole('button', { name: 'Add sizes' })).toHaveCount(0);
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  // 3XL was new to the shop: the size attribute gains it.
  const batch = log.calls.filter(
    (call) => call.method === 'POST' && call.path === '/attributes/a-1/options/batch',
  );
  expect(batch).toHaveLength(1);

  await main(page).getByRole('button', { name: 'Remove 3XL' }).click();
  await stockBox(page).fill('30');
  await save(page).click();
  await expect(savedSheet(page)).toBeVisible();
  const [body] = created(log);
  expect(body).toMatchObject({ sharedStock: true, sharedOpeningStock: 30 });
  const variants = body?.variants as Record<string, unknown>[];
  expect(variants).toHaveLength(3);
  expect(new Set(variants.map((row) => Number(row.packAmount)))).toEqual(new Set([1]));
});

test('the split by size and design: a grid, Same for all, the empty rows named, each box its own stock', async ({
  page,
}) => {
  const log = await open(page);
  await addPhotos(page, 2);
  await named(page, 'Three-piece', '2400');
  await pickSizes(page, ['M', 'L']);
  await expect(main(page)).toContainText('All designs and sizes together');
  await main(page).getByRole('button', { name: 'Give each design and size its own stock' }).click();
  const grid = main(page).getByRole('table');
  await expect(grid.getByRole('columnheader', { name: 'M' })).toBeVisible();
  await expect(grid.getByRole('rowheader', { name: 'Design 2' })).toBeVisible();
  await grid.getByLabel('Design 1 · M').fill('4');
  await save(page).click();
  await expect(main(page)).toContainText(
    'Design 2 is empty. Write a number, or 0 if there are none.',
  );
  expect(created(log)).toHaveLength(0);

  await main(page).getByLabel('Same for all').fill('3');
  await main(page).getByRole('button', { name: 'Fill' }).click();
  await expect(main(page)).toContainText('12 pcs in all');
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await save(page).click();
  await expect(savedSheet(page)).toBeVisible();
  const [body] = created(log);
  expect(body?.sharedStock).not.toBe(true);
  const variants = body?.variants as Record<string, unknown>[];
  expect(variants.map((row) => Number(row.openingStock))).toEqual([3, 3, 3, 3]);
});

test('photos as designs: a box under each photo once split, and the menu makes one another photo of a design', async ({
  page,
}) => {
  await open(page);
  await addPhotos(page, 3);
  await expect(main(page)).toContainText('3 designs');
  await expect(main(page)).toContainText('All designs together');
  await main(page).getByRole('button', { name: 'Give each design its own stock' }).click();
  await expect(main(page)).toContainText('Write each design’s stock under its photo.');
  await expect(main(page).getByLabel('Stock of Design 1')).toBeVisible();
  await expect(main(page).getByLabel('Stock of Design 3')).toBeVisible();

  await main(page).getByRole('button', { name: 'Photo 2: what it is' }).click();
  const menu = page.getByRole('dialog', { name: 'This photo' });
  await expect(menu.getByRole('radio', { name: /^Its own design/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectAccessible(page);
  await menu.getByRole('radio', { name: /^Same design, another angle/ }).click();
  await menu.getByRole('button', { name: 'Design 1', exact: true }).click();
  await menu.getByRole('button', { name: 'OK' }).click();
  await expect(menu).toBeHidden();
  await expect(main(page)).toContainText('Photo of Design 1');
  await expect(main(page)).toContainText('2 designs');
  await expect(main(page).getByLabel(/^Stock of /)).toHaveCount(2);

  await main(page).getByRole('button', { name: 'Back to one stock' }).click();
  await expect(stockBox(page)).toBeVisible();
});

test('more settings: the groups, the colour link with one photo only, and options open the full form', async ({
  page,
}) => {
  await open(page);
  await openQuickMore(page);
  for (const group of ['Delivery', 'Payment', 'Prices and options', 'Other']) {
    await expect(main(page).getByText(group, { exact: true }).first()).toBeVisible();
  }
  await expect(main(page).getByRole('switch', { name: /Made to order/ })).not.toBeChecked();
  await expect(main(page).getByRole('button', { name: /^Category \(optional\)/ })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Size chart/ })).toBeVisible();
  await expect(
    main(page).getByRole('button', { name: 'Several colours in one photo? Add colours' }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  // The size chart is a picture: no table to fill in (the server keeps the table form).
  await main(page)
    .getByRole('button', { name: /^Size chart/ })
    .click();
  const chart = page.getByRole('dialog', { name: /Size chart/ });
  await expect(chart.getByRole('radio', { name: 'Table' })).toHaveCount(0);
  await expect(chart.getByRole('button', { name: 'Table' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(chart).toBeHidden();

  await addPhotos(page, 2);
  await expect(
    main(page).getByRole('button', { name: 'Several colours in one photo? Add colours' }),
  ).toHaveCount(0);

  await named(page);
  await stockBox(page).fill('7');
  await main(page)
    .getByRole('button', { name: 'A different price or SKU per design or size' })
    .click();
  // Today's full form, with what was typed.
  await expect(main(page).getByRole('radio', { name: 'Combo pack' })).toBeVisible();
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Panjabi');
});

test('the fee on top: what Save takes and the balance; short, it says so with Top up', async ({
  page,
}) => {
  await open(page, '/products/new', payg('500.00'));
  await expect(main(page)).toContainText(
    'Saving it takes ৳10 from the balance. The balance holds ৳500.',
  );
  await expectAccessible(page);

  await open(page, '/products/new', payg('0.50'));
  await expect(main(page)).toContainText('A new product costs ৳10.');
  await expect(main(page)).toContainText('The balance holds ৳0.50');
  await main(page).getByRole('button', { name: 'Top up' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/balance\\?topup=1`));
});

test('pq-saved: the first save shows the landing link to copy and open, the share links, then another product', async ({
  page,
}) => {
  await open(page);
  await named(page);
  await stockBox(page).fill('8');
  await save(page).click();
  const saved = savedSheet(page);
  await expect(saved).toBeVisible();
  await expect(saved).toContainText('Panjabi');
  await expect(saved).toContainText('৳1,250');
  await expect(saved.getByText('megh.lytro.app/l/p-new-1', { exact: true })).toBeVisible();
  await expect(saved.getByRole('link', { name: 'See the page' })).toHaveAttribute(
    'href',
    'https://megh.lytro.app/l/p-new-1',
  );
  await expect(saved.getByRole('link', { name: 'See the page' })).toHaveAttribute(
    'target',
    '_blank',
  );
  // No share sheet in this browser: WhatsApp, Facebook and Messenger instead (the first two before the shop link's).
  await expect(saved.getByRole('link', { name: 'WhatsApp' }).first()).toHaveAttribute(
    'href',
    'https://wa.me/?text=https%3A%2F%2Fmegh.lytro.app%2Fl%2Fp-new-1',
  );
  await expect(saved.getByRole('link', { name: 'Facebook' }).first()).toHaveAttribute(
    'href',
    'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmegh.lytro.app%2Fl%2Fp-new-1',
  );
  await expect(saved.getByRole('link', { name: 'Messenger' })).toBeVisible();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  await saved.getByRole('button', { name: 'Copy link' }).click();
  await expect(saved.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
    'https://megh.lytro.app/l/p-new-1',
  ]);
  await expect(saved.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 3000 });

  await saved.getByRole('button', { name: 'Add another product' }).click();
  await expect(saved).toBeHidden();
  await expect(page).toHaveURL(`/${SLUG}/products/new`);
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(stockBox(page)).toHaveValue('');
});

test('pq-saved: the phone share sheet when there is one, and Go to the product', async ({
  page,
}) => {
  await open(page, '/products/new', {}, 'native');
  await named(page);
  await stockBox(page).fill('8');
  await save(page).click();
  const saved = savedSheet(page);
  await saved.getByRole('button', { name: 'Share' }).click();
  expect(await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)).toEqual([
    { title: 'Panjabi', url: 'https://megh.lytro.app/l/p-new-1' },
  ]);
  // The fallbacks are for a browser with no share sheet; the shop link keeps its own Facebook and WhatsApp.
  await expect(saved.getByRole('link', { name: 'Messenger' })).toHaveCount(0);
  await expect(saved.getByRole('link', { name: 'WhatsApp' })).toHaveCount(1);
  await saved.getByRole('button', { name: 'Go to the product' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-new-[0-9]+$`));
});

test('pq-saved-paused: a storefront waiting for its top-up still gets the link, with when it opens', async ({
  page,
}) => {
  await open(page, '/products/new', payg('500.00', { fairUse: { paused: true } }));
  await named(page);
  await stockBox(page).fill('8');
  await save(page).click();
  const saved = savedSheet(page);
  await expect(saved.getByText('megh.lytro.app/l/p-new-1', { exact: true })).toBeVisible();
  await expect(saved).toContainText('The link opens once a ৳10 top-up opens the shop.');
  await expect(saved.getByRole('link', { name: 'Top up' })).toHaveAttribute(
    'href',
    /\/balance\?topup=1&amount=10$/,
  );
  await expectAccessible(page);
});

test('editing a saved product shows no share sheet', async ({ page }) => {
  await open(page, '/products/p-1');
  await main(page).getByLabel('Price', { exact: true }).fill('470');
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: /./ })).toHaveText(
    'Saved. Cotton T-shirt is on the storefront.',
  );
  await expect(savedSheet(page)).toHaveCount(0);
});

test('pq-first: a brand-new shop lands here with a welcome, once; Later goes Home and its checklist', async ({
  page,
}) => {
  await open(page, '/products/new?first=1', DAY_ONE);
  const welcome = main(page).getByText(
    'Your shop is ready! Add your first product, then share its link.',
  );
  await expect(welcome).toBeVisible();
  // The address drops ?first=1, so Back or a reload doesn't bring it again.
  await expect(page).toHaveURL(`/${SLUG}/products/new`);
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  await main(page).getByRole('button', { name: 'Later' }).click();
  await expect(page).toHaveURL(`/${SLUG}`);
  await expect(main(page).getByText('Add your first product').first()).toBeVisible();
  await expect(main(page).getByText('Share your shop link').first()).toBeVisible();

  await page.goto(`/${SLUG}/products/new`);
  await expect(stockBox(page)).toBeVisible();
  await expect(welcome).toHaveCount(0);
});

test("pq-saved: the shop's link under the product's, each copied or shared ticking the checklist's link step", async ({
  page,
}) => {
  const log = await open(page, '/products/new', DAY_ONE);
  const marked = () =>
    log.calls.filter((call) => call.method === 'POST' && call.path === '/home/link-shared').length;
  await named(page);
  await stockBox(page).fill('8');
  await save(page).click();
  const saved = savedSheet(page);
  await expect(saved.getByText('megh.lytro.app/l/p-new-1', { exact: true })).toBeVisible();
  const shop = saved.getByRole('region', { name: 'Your shop link' });
  await expect(shop.getByText('megh.lytro.app', { exact: true })).toBeVisible();
  await expect(shop.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/?text=https%3A%2F%2Fmegh.lytro.app',
  );
  await expect(shop.getByRole('link', { name: 'Facebook' })).toBeVisible();
  expect(marked()).toBe(0);

  await saved.getByRole('button', { name: 'Copy link' }).click();
  await expect.poll(marked).toBe(1);
  await shop.getByRole('button', { name: 'Copy' }).click();
  await expect(shop.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect.poll(marked).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
    'https://megh.lytro.app/l/p-new-1',
    'https://megh.lytro.app',
  ]);
});
