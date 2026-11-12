import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { burka, burkaOrders, shot, withBurka } from './support/designs';
import { drawnProducts } from './support/products';
import { DESIGN_ATTRIBUTE_ID } from './support/variants';

// TENANT-DASHBOARD-DESIGN §7.42 (the prototype's Part 40; PHOTO-DESIGNS-PLAN PD-2, PD-3, PD-8 to PD-11, PD-14, PD-16,
// PD-22): a product's photos as its designs in the dashboard -- each photo's design on the photos sheet, a photo made its
// own design, another angle or plain, names, new photos as new designs, a product with orders keeping its photos plain,
// a design's last photo, the design split by its photos, the pickers by photo, and the order and label naming the design,
// size and SKU. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp = 'Photos and video') =>
  page.getByRole('dialog', { name });
const save = (page: Page) =>
  main(page)
    .getByRole('button', { name: /^(Save|Fix \d+ things? to save)$/ })
    .first();

/** A file the browser sends. */
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.alloc(2048, 1) });

function sent(log: ApiLog, method: string, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body as Record<string, unknown>);
}

/** Where in the calls a request was made. */
const at = (log: ApiLog, method: string, path: string): number =>
  log.calls.findIndex((call) => call.method === method && call.path === path);

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

test('the photos sheet names each photo’s design; a photo becomes its own design, a name changes, and Save sends the photos before the variants (PD-2, PD-14, PD-16)', async ({
  page,
}) => {
  const log = await open(page, '/products/p-burka', { products: withBurka() });
  await expect(main(page).getByText('Photos · Video · 2 designs')).toBeVisible();
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  const photos = sheet(page);
  await expect(photos.getByRole('button', { name: 'Photo 1: Design 1' })).toBeVisible();
  await expect(photos.getByRole('button', { name: 'Photo 2: Stripe' })).toBeVisible();
  await expect(photos.getByRole('button', { name: 'Photo 3: Stripe' })).toBeVisible();
  await expect(photos.getByRole('heading', { name: 'Designs · 2' })).toBeVisible();
  await expect(photos).toContainText('Only you see the names: on orders, labels and SKUs.');
  await expectAccessible(page);

  // Photo 3 is Stripe's other angle; it becomes a design of its own, which takes the next number.
  await photos.getByRole('button', { name: 'Photo 3: Stripe' }).click();
  const step = sheet(page, 'Photo 3');
  await expect(step.getByRole('radio', { name: /^Same design, another angle/ })).toBeChecked();
  await expect(step.getByRole('button', { name: 'Stripe', pressed: true })).toBeVisible();
  await step.getByRole('radio', { name: /^Its own design/ }).click();
  await expect(step.getByRole('radio', { name: /^Its own design/ })).toBeChecked();
  await step.getByRole('button', { name: 'Done' }).click();
  await expect(photos.getByRole('button', { name: 'Photo 3: Design 3' })).toBeVisible();
  await expect(photos.getByRole('heading', { name: 'Designs · 3' })).toBeVisible();
  await photos.getByLabel('Name of Design 1').fill('Black');
  await expect(photos.getByRole('button', { name: 'Photo 1: Black' })).toBeVisible();
  await photos.getByRole('button', { name: 'Done' }).click();

  // The new design splits the variants too: its two sizes join, at 0.
  await expect(main(page).getByRole('button', { name: /Design 3 · 54/ })).toBeVisible();
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  const [photosSent] = sent(log, 'PUT', '/products/p-burka/images') as {
    photos: { mediaId: string; design: string | null }[];
    designs: { key: string; id?: string; name: string }[];
  }[];
  const key = photosSent?.designs[2]?.key ?? '';
  expect(photosSent).toEqual({
    photos: [
      { mediaId: 'm-1', design: 'd-1' },
      { mediaId: 'm-2', design: 'd-2' },
      { mediaId: 'm-3', design: key },
    ],
    designs: [
      { key: 'd-1', id: 'd-1', name: 'Black' },
      { key: 'd-2', id: 'd-2', name: 'Stripe' },
      { key, name: 'Design 3' },
    ],
  });
  // The variants go after the photos, naming the new design by the id the photos save gave it, never its key.
  expect(at(log, 'PUT', '/products/p-burka/images')).toBeLessThan(
    at(log, 'PUT', '/products/p-burka/variants'),
  );
  const [variants] = sent(log, 'PUT', '/products/p-burka/variants') as {
    variantAttributes: { attributeId: string; optionIds: string[] }[];
  }[];
  const designSplit = variants?.variantAttributes.find(
    (each) => each.attributeId === DESIGN_ATTRIBUTE_ID,
  );
  expect(designSplit?.optionIds).toEqual(['d-1', 'd-2', expect.stringMatching(/^d-new-/)]);
  expect(JSON.stringify(variants)).not.toContain(key);
  // Saved: nothing is left to save.
  await expect(save(page)).toHaveText('Save');
  await save(page).click();
  expect(sent(log, 'PUT', '/products/p-burka/images')).toHaveLength(1);
});

test('a new photo is a design of its own, its variants starting at 0; made plain, they go (PD-3)', async ({
  page,
}) => {
  await open(page, '/products/p-burka', { products: withBurka() });
  await main(page)
    .locator('input[type=file][accept^="image"]')
    .first()
    .setInputFiles(file('green.png'));
  await expect(main(page).getByRole('button', { name: 'Photo 4' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /Design 3 · 54/ })).toBeVisible();
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  const photos = sheet(page);
  await expect(photos).toContainText(
    'New photos made 1 new design, in 2 variants, starting at 0 in stock.',
  );
  await photos.getByRole('button', { name: 'Photo 4: Design 3' }).click();
  const step = sheet(page, 'Photo 4');
  await step.getByRole('radio', { name: /^Not a design/ }).click();
  await step.getByRole('button', { name: 'Done' }).click();
  await expect(photos.getByRole('button', { name: 'Photo 4: Plain photo' })).toBeVisible();
  await expect(photos).not.toContainText('New photos made');
  await photos.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('button', { name: /Design 3 · 54/ })).toHaveCount(0);
});

test('a product with orders and no designs keeps new photos plain, its photos unable to become designs (PD-11, ATR-15)', async ({
  page,
}) => {
  const products = drawnProducts();
  const [shirt] = products.products;
  if (shirt) shirt.hasOrders = true;
  await open(page, '/products/p-1', { products });
  await main(page)
    .locator('input[type=file][accept^="image"]')
    .first()
    .setInputFiles(file('back.png'));
  await expect(main(page).getByRole('button', { name: 'Photo 4' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  const photos = sheet(page);
  await expect(photos).toContainText(
    'This product has orders, so new photos are added as plain photos.',
  );
  await photos.getByRole('button', { name: 'Photo 4: Plain photo' }).click();
  const step = sheet(page, 'Photo 4');
  await expect(step).toContainText("It has orders, so this product can't gain designs.");
  await expect(step.getByRole('radio', { name: /^Its own design/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Tapped anyway, nothing changes.
  await step.getByRole('radio', { name: /^Its own design/ }).click({ force: true });
  await expect(step.getByRole('radio', { name: /^Not a design/ })).toBeChecked();
});

test('removing a design’s last photo asks first while its variants hold stock; Keep keeps it (PD-16)', async ({
  page,
}) => {
  const log = await open(page, '/products/p-burka', { products: withBurka() });
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  await sheet(page).getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  const asking = page.getByRole('dialog', { name: "Remove Design 1's last photo?" });
  await expect(asking).toContainText("Design 1's 2 variants hold 3 in stock.");
  await asking.getByRole('button', { name: 'Keep' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Photo 1: Design 1' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  await page
    .getByRole('dialog', { name: "Remove Design 1's last photo?" })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(sheet(page).getByRole('heading', { name: 'Designs · 1' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  expect(sent(log, 'PUT', '/products/p-burka/images')[0]).toEqual({
    photos: [
      { mediaId: 'm-2', design: 'd-2' },
      { mediaId: 'm-3', design: 'd-2' },
    ],
    designs: [{ key: 'd-2', id: 'd-2', name: 'Stripe' }],
  });
});

test('a product with orders keeps its last design (ATR-15)', async ({ page }) => {
  const one = burka({
    hasOrders: true,
    imageIds: ['m-1'],
    photoDesigns: { 'm-1': 'd-1' },
    designs: [{ id: 'd-1', name: 'Design 1', number: 1 }],
    matrix: {
      splits: [{ attributeId: DESIGN_ATTRIBUTE_ID, optionIds: ['d-1'] }],
      rows: [{ id: 'v-1', optionIds: ['d-1'], price: null, sku: 'IB-D1', onHand: 0 }],
    },
  });
  await open(page, '/products/p-burka', { products: withBurka(one) });
  await main(page).getByRole('button', { name: 'Photo 1' }).click();
  await sheet(page).getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  const refused = page.getByRole('dialog', { name: 'The last design stays' });
  await expect(refused).toContainText("It has orders, so its last design's last photo can't go");
  await refused.getByRole('button', { name: 'OK' }).click();
  await sheet(page).getByRole('button', { name: 'Photo 1: Design 1' }).click();
  await expect(
    sheet(page, 'Photo 1').getByRole('radio', { name: /^Not a design/ }),
  ).toHaveAttribute('aria-disabled', 'true');
});

test('the variants card splits by design with its photos, Change in photos in place of Add option; a design’s SKU fills (PD-1, PD-10)', async ({
  page,
}) => {
  await open(page, '/products/p-burka', { products: withBurka() });
  const card = main(page).getByRole('region', { name: 'Options and variants' });
  await expect(card.getByRole('heading', { name: /^Design/ })).toBeVisible();
  await expect(card).toContainText('Designs come from the photos.');
  await expect(card).toContainText('An empty SKU is filled when you save, such as IB-D2-54.');
  // One Add option, the Size's: designs come from the photos.
  await expect(card.getByRole('button', { name: 'Add option' })).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Remove Stripe' })).toHaveCount(0);
  await card.getByRole('button', { name: /Design 1 · 54/ }).click();
  await expect(sheet(page, 'Design 1 · 54')).toContainText(
    'Filled when you save if empty; you can change it.',
  );
  await sheet(page, 'Design 1 · 54').getByRole('button', { name: 'Done' }).click();
  await card.getByRole('button', { name: 'Change in photos' }).click();
  await expect(sheet(page)).toBeVisible();
});

test('New order offers a design product’s variants under each design’s photo, and the line shows that photo (PD-22)', async ({
  page,
}) => {
  await open(page, '/orders/new', { products: withBurka() });
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await sheet(page, 'Add an item')
    .getByRole('button', { name: /^Irani burka/ })
    .click();
  const pick = sheet(page, 'Irani burka');
  await expect(pick.getByText('Design 1', { exact: true })).toBeVisible();
  await expect(pick.getByText('Stripe', { exact: true })).toBeVisible();
  // Under Stripe's photo, its sizes alone.
  const stripe54 = pick.getByRole('button', { name: /^54/ }).nth(1);
  await stripe54.click();
  await expect(main(page)).toContainText('Stripe · 54');
  await expect(
    main(page)
      .locator(`img[src="${shot('m-2')}"]`)
      .first(),
  ).toBeVisible();
});

test('a combo’s part is ticked by design photo and size (PD-22)', async ({ page }) => {
  await open(page, '/products/new', { products: withBurka() });
  await main(page).getByRole('radio', { name: 'Combo pack' }).click();
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await page
    .getByRole('dialog', { name: 'Which product?' })
    .getByRole('button', { name: /^Irani burka/ })
    .click();
  const tick = page.getByRole('dialog', { name: /which can go in\?/ });
  await expect(tick.getByText('Stripe', { exact: true })).toBeVisible();
  await expect(tick.getByRole('checkbox', { name: /^54/ })).toHaveCount(2);
  await expect(tick.locator(`img[src="${shot('m-2')}"]`)).toBeVisible();
});

test('the order page names a design line’s SKU, and the 3 × 3 label its design, size and SKU (PD-9)', async ({
  page,
}) => {
  const orders = burkaOrders();
  await open(page, '/orders/o-47', { orders });
  await expect(main(page)).toContainText('Stripe · 54');
  await expect(main(page)).toContainText('SKU IB-D2-54');
  await expect(
    main(page)
      .locator(`img[src="${shot('m-2')}"]`)
      .first(),
  ).toBeVisible();
  await main(page)
    .getByRole('button', { name: /^Order #/ })
    .click();
  await sheet(page, /^Order #/)
    .getByRole('button', { name: 'Print label' })
    .click();
  await expect(sheet(page, 'Print label')).toContainText(
    '2 items: Irani burka (Stripe · 54 · IB-D2-54) ×1, Eid combo ×1',
  );
});
