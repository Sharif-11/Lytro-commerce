import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts, MEDIA_UPLOAD_PREFIX, type ProductsFixture } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.5, Slice 11.8: Categories -- the tree with each row's products, Hidden and the type it
// behaves like; the switch that shows or hides at once; New category and Add a sub-category with where it sits as a step;
// a category's sheet with its suggested attributes and its own chart (Part 19); the ⋯ menu's moves; the three ways a
// delete goes; a new shop's suggested categories; and someone who may only look. Each test runs on a phone and on a
// desktop (playwright.config.ts).

/** The drawn shop, Kids behaving like clothing and Accessories hidden (the prototype's `CAT_ROWS`). */
function drawnTree(): ProductsFixture {
  return {
    ...drawnProducts(),
    categoryState: {
      'c-kids': { behavesLike: 'clothing' },
      'c-accessories': { visible: false },
    },
  };
}

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: drawnTree(), ...state });
  await page.goto(`/${SLUG}/categories`);
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }).first(),
  ).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

const MB = 1024 * 1024;

/** A picture the browser sends, of the given size. */
function file(name: string, bytes = 2048) {
  return { name, mimeType: 'image/jpeg', buffer: Buffer.alloc(bytes, 1) };
}

/** Holds every file's upload until `release`, so how far it is can be seen and what saves it waits (§7.43). */
async function holdUploads(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${MEDIA_UPLOAD_PREFIX}**`, async (route) => {
    await held;
    await route.fulfill({ status: 200 });
  });
  return release;
}

function sheet(page: Page) {
  return page.getByRole('dialog');
}

function toast(page: Page) {
  return page.getByRole('status').filter({ hasText: /./ });
}

/** A category's row, by the name its edit button starts with. */
function row(page: Page, name: string) {
  return main(page)
    .getByRole('button', { name: new RegExp(`^└?\\s*${name}`) })
    .first();
}

function more(page: Page, name: string) {
  return main(page).getByRole('button', { name: `More for ${name}` });
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

test('lists the tree with each category’s products, Hidden and its type, and Uncategorized last', async ({
  page,
}) => {
  await open(page);
  await expect(row(page, 'T-shirts')).toContainText('1 product');
  await expect(row(page, 'Men')).toContainText('└');
  await expect(row(page, 'Jackets')).toContainText('2 products');
  await expect(row(page, 'Kids')).toContainText('Behaves like Clothing');
  await expect(row(page, 'Accessories')).toContainText('Hidden');
  await expect(main(page).getByText('Uncategorized', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('switch', { name: 'Visible on the storefront' })).toHaveCount(
    7,
  );
  await expect(
    main(page).getByText(/The switch saves at once\. Reorder from the ⋯ menu\./),
  ).toBeVisible();
  await expectAccessible(page);
});

test('the switch shows or hides a category at once', async ({ page }) => {
  const log = await open(page);
  const switches = main(page).getByRole('switch', { name: 'Visible on the storefront' });
  await switches.nth(3).click();
  await expect(row(page, 'Jackets')).toContainText('Hidden');
  expect(log.sent('PATCH', '/categories/c-jackets')).toEqual({ visible: false });
  await switches.nth(3).click();
  await expect(row(page, 'Jackets')).not.toContainText('Hidden');
  expect(log.sent('PATCH', '/categories/c-jackets')).toEqual({ visible: true });
});

test('adds a category where it sits, marked new, and says so', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Add category' }).first().click();
  await expect(sheet(page).getByRole('heading', { name: 'New category' })).toBeVisible();
  await expect(sheet(page).getByText(/The link name is made from the name/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByText('A name is needed')).toBeVisible();
  await sheet(page).getByLabel('Name', { exact: true }).fill('Shirts');
  await sheet(page)
    .getByRole('button', { name: /^Parent/ })
    .click();
  await expect(sheet(page).getByRole('heading', { name: 'Where it sits' })).toBeVisible();
  // A new category takes nothing along, so only the depth limit greys a choice.
  await expect(sheet(page).getByText('Its sub-categories move with it.')).toHaveCount(0);
  await sheet(page).getByRole('radio', { name: 'T-shirts' }).click();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await sheet(page).getByLabel('Behaves like a shop type').selectOption('clothing');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('"Shirts" added');
  expect(log.sent('POST', '/categories')).toEqual({
    name: 'Shirts',
    parentId: 'c-tshirts',
    visible: true,
    behavesLike: 'clothing',
    imageId: null,
  });
  await expect(row(page, 'Shirts')).toContainText('New');
  await expect(row(page, 'Shirts')).toContainText('└');
});

test('edits a category: its name, where it sits, what it suggests and its own chart', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, 'T-shirts').click();
  await expect(sheet(page).getByRole('heading', { name: 'Category', exact: true })).toBeVisible();
  await sheet(page).getByLabel('Name', { exact: true }).fill('Tees');

  // It cannot sit inside itself, nor under what sits under it.
  await sheet(page)
    .getByRole('button', { name: /^Parent/ })
    .click();
  await expect(sheet(page).getByText('Its sub-categories move with it.')).toBeVisible();
  await expect(sheet(page).getByRole('radio', { name: /^Men/ })).toBeDisabled();
  await expect(sheet(page).getByRole('radio', { name: /^T-shirts/ })).toContainText(
    'Cannot sit inside itself',
  );
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Back' }).click();

  // Suggestions: Size and Colour ticked from the list, Size taken off again from its chip.
  await sheet(page).getByRole('button', { name: 'Add attribute' }).click();
  await expect(
    sheet(page).getByRole('heading', { name: 'Suggested for new products' }),
  ).toBeVisible();
  await sheet(page).getByLabel('Type or search a name').fill('o');
  await expect(sheet(page).getByRole('checkbox', { name: /^Size/ })).toHaveCount(0);
  await sheet(page).getByLabel('Type or search a name').fill('');
  await sheet(page).getByRole('checkbox', { name: /^Size/ }).check();
  await sheet(page)
    .getByRole('checkbox', { name: /^Colour/ })
    .check();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await sheet(page).getByRole('button', { name: 'Remove Size' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Remove Colour' })).toBeVisible();

  // Its own chart: the sheet over the page in the category's place, Done keeps it for Save.
  await expect(sheet(page).getByRole('button', { name: / Edit$/ })).toContainText('No chart');
  await sheet(page)
    .getByRole('button', { name: / Edit$/ })
    .click();
  await expect(sheet(page).getByRole('heading', { name: 'Size chart · Tees' })).toBeVisible();
  await expect(sheet(page).getByText(/Shown on every product here and below/)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Remove the chart' })).toHaveCount(0);
  await sheet(page).getByLabel('Row 1, column 2').fill('Chest');
  await sheet(page).getByLabel('Row 2, column 1').fill('M');
  await sheet(page).getByLabel('Row 2, column 2').fill('40');
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page).getByRole('button', { name: / Edit$/ })).toContainText(
    '1 row × 1 column',
  );
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('PATCH', '/categories/c-tshirts')).toEqual({ name: 'Tees' });
  expect(log.sent('PUT', '/categories/c-tshirts/attributes')).toEqual({ attributeIds: ['a-2'] });
  expect(log.sent('PUT', '/categories/c-tshirts/size-chart')).toEqual({
    rows: [
      ['', 'Chest'],
      ['M', '40'],
    ],
  });
  await expect(row(page, 'Tees')).toBeVisible();

  // Removing the chart deletes it on Save.
  await row(page, 'Tees').click();
  await sheet(page)
    .getByRole('button', { name: / Edit$/ })
    .click();
  await sheet(page).getByRole('button', { name: 'Remove the chart' }).click();
  await expect(sheet(page).getByRole('button', { name: / Edit$/ })).toContainText('No chart');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(
    log.calls.some(
      (call) => call.method === 'DELETE' && call.path === '/categories/c-tshirts/size-chart',
    ),
  ).toBe(true);
});

test("a category's picture says how far its upload is, then shows, and Save sends it (§7.43)", async ({
  page,
}) => {
  const log = await open(page);
  const release = await holdUploads(page);
  await row(page, 'T-shirts').click();
  await expect(sheet(page).getByRole('button', { name: 'Add photo' })).toBeVisible();
  await sheet(page).locator('input[type=file]').first().setInputFiles(file('tees.jpg'));
  await expect(
    sheet(page)
      .getByRole('status')
      .filter({ hasText: /^Uploading \d+%/ }),
  ).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  release();
  await expect(sheet(page).getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toBeEnabled();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  const sentPicture = log.sent('PATCH', '/categories/c-tshirts') as
    { imageId?: unknown } | undefined;
  expect(Object.keys(sentPicture ?? {})).toEqual(['imageId']);
  expect(sentPicture?.imageId).toMatch(/^m-up-/);

  // Opened again it has the picture; Remove leaves Add photo, and Save clears it.
  await row(page, 'T-shirts').click();
  await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(sheet(page).getByRole('button', { name: 'Add photo' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('PATCH', '/categories/c-tshirts')).toEqual({ imageId: null });
});

test("a category's picture over the limit says so, with Choose another, and Save still works (§7.43)", async ({
  page,
}) => {
  await open(page);
  await row(page, 'T-shirts').click();
  await sheet(page)
    .locator('input[type=file]')
    .first()
    .setInputFiles(file('big.jpg', 6 * MB));
  await expect(
    sheet(page).getByRole('alert').filter({ hasText: '6 MB · limit 5 MB' }),
  ).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Choose another' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toBeEnabled();
});

test("a category's chart picture shows its upload in the picture's place, and Done waits (§7.43)", async ({
  page,
}) => {
  const log = await open(page);
  const release = await holdUploads(page);
  await row(page, 'T-shirts').click();
  await sheet(page)
    .getByRole('button', { name: / Edit$/ })
    .click();
  await sheet(page).getByRole('radio', { name: 'Picture' }).click();
  await sheet(page).locator('input[type=file]').first().setInputFiles(file('chart.jpg'));
  await expect(
    sheet(page)
      .getByRole('status')
      .filter({ hasText: /^Uploading \d+%/ }),
  ).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Done' })).toBeDisabled();
  release();
  await expect(sheet(page).getByRole('img', { name: 'Size chart' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  const chart = log.sent('PUT', '/categories/c-tshirts/size-chart') as
    { imageId?: unknown } | undefined;
  expect(chart?.imageId).toMatch(/^m-up-/);
});

test('the ⋯ menu moves a category among its siblings and adds one under it', async ({
  page,
}, testInfo) => {
  // A computer moves by dragging (D8-72): its rows have grips, not the ⋯ menu (categories-move.spec.ts).
  test.skip(testInfo.project.name === 'desktop', 'the ⋯ menu is a phone’s');
  const log = await open(page);
  await more(page, 'Jackets').click();
  await expect(sheet(page).getByRole('heading', { name: 'Jackets' })).toBeVisible();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Move up' }).click();
  await expect(sheet(page)).toHaveCount(0);
  // One request moves it before T-shirts, the server renumbering the level (D8-72).
  expect(log.sent('POST', '/categories/c-jackets/move')).toEqual({ parentId: null, afterId: null });
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);
  const names = main(page).getByRole('button', { name: /^(T-shirts|Jackets)/ });
  await expect(names.first()).toContainText('Jackets');

  // The first has no Move up; the last no Move down.
  await more(page, 'Jackets').click();
  await expect(sheet(page).getByRole('button', { name: 'Move up' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Close' }).click();
  await more(page, 'Accessories').click();
  await expect(sheet(page).getByRole('button', { name: 'Move down' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Show on the storefront' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Add a sub-category' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Add a sub-category' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /^Parent/ })).toContainText('Accessories');
});

test('a delete goes three ways: not yet, with its products moved, or simply', async ({ page }) => {
  const log = await open(page);
  // T-shirts has sub-categories. Its sheet's Delete, as on a computer, where rows have no ⋯ menu.
  await row(page, 'T-shirts').click();
  await sheet(page).getByRole('button', { name: 'Delete category' }).click();
  await expect(
    page.getByRole('heading', { name: '"T-shirts" cannot be deleted yet' }),
  ).toBeVisible();
  await expect(page.getByText('It has 2 sub-categories. Move or delete them first.')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Done' }).click();

  // Jackets holds two products: they move to Uncategorized.
  await row(page, 'Jackets').click();
  await sheet(page).getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByRole('heading', { name: 'Delete "Jackets"?' })).toBeVisible();
  await expect(
    page.getByText(
      'It holds 2 products. Deleting moves them to Uncategorized; nothing is removed.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move the products and delete' }).click();
  await expect(toast(page)).toHaveText('"Jackets" deleted · 2 products now uncategorized');
  expect(
    log.calls.some(
      (call) =>
        call.method === 'DELETE' &&
        call.path === '/categories/c-jackets' &&
        call.query.includes('products=uncategorize'),
    ),
  ).toBe(true);
  await expect(row(page, 'Jackets')).toHaveCount(0);
  await expect(main(page).getByText('Uncategorized', { exact: true }).locator('..')).toContainText(
    '2 products',
  );

  // Men holds nothing.
  await row(page, 'Men').click();
  await sheet(page).getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByText('It holds nothing.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(toast(page)).toHaveText('"Men" deleted');
});

test('a new shop sees its type’s suggested categories and adds them in one tap', async ({
  page,
}) => {
  const log = await mockApi(page, {
    language: 'en',
    products: {
      products: [],
      limit: 100,
      categories: [],
      defaults: { suggestedCategories: ['T-shirts', 'Shirts', 'Panjabi'] },
    },
  });
  await page.goto(`/${SLUG}/categories`);
  await expect(
    main(page).getByText('No categories yet. Products sell without one too.'),
  ).toBeVisible();
  await expect(
    main(page).getByRole('heading', { name: 'Suggested for a clothing shop' }),
  ).toBeVisible();
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Add these 3' }).click();
  await expect(toast(page)).toHaveText('3 categories added');
  expect(
    log.calls.filter((call) => call.method === 'POST' && call.path === '/categories'),
  ).toHaveLength(3);
  await expect(row(page, 'Panjabi')).toBeVisible();
});

test('someone who may only look sees the tree without changing it', async ({ page }) => {
  await open(page, { isOwner: false, permissions: ['products:read'] });
  await expect(row(page, 'T-shirts')).toBeDisabled();
  await expect(main(page).getByRole('button', { name: 'Add category' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^More for/ })).toHaveCount(0);
  await expect(main(page).getByRole('switch').first()).toBeDisabled();
});
