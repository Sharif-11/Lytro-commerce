import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { gripOf, holdOver, p88Tree, refuseMoves } from './support/p88-cat-mock';

// TENANT-DASHBOARD-DESIGN §7.41, Slice 8.8 (D8-72, Part 39's `p88-cat` group): categories by dragging on a computer --
// inside a row, between two, a drop refused with why, Undo -- the same by the keyboard through the grip, a move a change
// meanwhile made impossible, and a phone's Move to…. Every move is one `POST /categories/:id/move`. The sketch's tree:
// T-shirts > Men > Formal > Slim fit, T-shirts > Women; Jackets; Sarees; Kids > Baby; Accessories.

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: p88Tree(), ...state });
  await page.goto(`/${SLUG}/categories`);
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }).first(),
  ).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

/** A category's edit button, by the name it starts with (after the └ of a sub-category). */
function row(page: Page, name: string) {
  return main(page)
    .getByRole('button', { name: new RegExp(`^└?\\s*${name}`) })
    .first();
}

function grip(page: Page, name: string) {
  return gripOf(page, name);
}

function toast(page: Page, text: RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}

function moves(log: ApiLog) {
  return log.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/move'));
}

const computerOnly = (testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'a computer drags; a phone uses Move to…');
};

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

test('a computer drags a category inside another, last, and Undo moves it back', async ({
  page,
}, testInfo) => {
  computerOnly(testInfo);
  const log = await open(page);
  await expect(
    main(page).getByText('Drag to arrange: drop on a category to put it inside'),
  ).toBeVisible();
  // A computer's rows have grips, not the ⋯ menu.
  await expect(main(page).getByRole('button', { name: 'More for Kids' })).toBeHidden();
  await expectAccessible(page);

  await holdOver(page, 'Kids', 'T-shirts', 0.5);
  await expect(main(page).getByText('Put inside T-shirts')).toBeVisible();
  await page.mouse.up();
  await expect(toast(page, /Kids is now inside T-shirts/)).toBeVisible();
  expect(log.sent('POST', '/categories/c-kids/move')).toEqual({
    parentId: 'c-tshirts',
    afterId: 'c-women',
  });
  await expect(main(page).getByRole('button', { name: /^└\s*Kids/ })).toBeVisible();

  await toast(page, /Kids is now inside/)
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(toast(page, /^Kids moved/)).toBeVisible();
  expect(log.sent('POST', '/categories/c-kids/move')).toEqual({
    parentId: null,
    afterId: 'c-sarees',
  });
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Kids/ })).toBeVisible();
});

test('a computer drops a category between two, a line showing where it lands', async ({
  page,
}, testInfo) => {
  computerOnly(testInfo);
  const log = await open(page);
  await holdOver(page, 'Kids', 'Sarees', 0.1);
  await expect(main(page).getByText('Place here')).toBeVisible();
  await expect(main(page).getByText('Put inside')).toHaveCount(0);
  await page.mouse.up();
  await expect(toast(page, /^Kids moved/)).toBeVisible();
  expect(log.sent('POST', '/categories/c-kids/move')).toEqual({
    parentId: null,
    afterId: 'c-jackets',
  });
  // Kids now between Jackets and Sarees.
  const names = await main(page)
    .getByRole('button', { name: /^(Jackets|Sarees|Kids)/ })
    .allInnerTexts();
  expect(names.map((each) => each.split('\n')[0])).toEqual(['Jackets', 'Kids', 'Sarees']);
});

test('a drop the rules refuse says why where it would land, and sends nothing', async ({
  page,
}, testInfo) => {
  computerOnly(testInfo);
  const log = await open(page);
  // Kids, with Baby under it, inside Slim fit would be six levels deep.
  await holdOver(page, 'Kids', 'Slim fit', 0.5);
  await expect(
    main(page).getByText("Can't go here: it would be more than four levels deep"),
  ).toBeVisible();
  await page.mouse.up();
  // T-shirts inside its own Formal.
  await holdOver(page, 'T-shirts', 'Formal', 0.5);
  await expect(
    main(page).getByText("Can't go inside itself or one of its own sub-categories"),
  ).toBeVisible();
  await page.mouse.up();
  // Esc puts a held one back.
  await holdOver(page, 'Kids', 'Jackets', 0.5);
  await expect(main(page).getByText('Put inside Jackets')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(main(page).getByText('Put inside Jackets')).toHaveCount(0);
  await page.mouse.up();
  expect(moves(log)).toEqual([]);
});

test('the keyboard moves a category through its grip, its words read out', async ({
  page,
}, testInfo) => {
  computerOnly(testInfo);
  const log = await open(page);
  const said = page.locator('[aria-live="polite"]');
  await expectAccessible(page);
  await grip(page, 'Kids').focus();
  await page.keyboard.press('Space');
  // The banner says how, and the same words are read out.
  await expect(main(page).getByText('Picked up Kids. ↑ ↓ choose a place').first()).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(said).toHaveText('At the top level, after Jackets');
  await expect(main(page).getByText('Place here')).toBeVisible();

  // Up to between Slim fit and Women, then in: too deep under Formal, so Space leaves it held.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(said).toHaveText('Inside T-shirts, after Men');
  await page.keyboard.press('ArrowRight');
  await expect(said).toHaveText('Inside Men, after Formal');
  await page.keyboard.press('ArrowRight');
  await expect(said).toHaveText("Can't go here: it would be more than four levels deep");
  await page.keyboard.press('Space');
  expect(moves(log)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(said).toHaveText('Cancelled: Kids stays where it was');
  await expect(main(page).getByText('Picked up Kids')).toHaveCount(0);
  expect(moves(log)).toEqual([]);

  // Picked up again, up one and dropped: between Jackets and Sarees.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(toast(page, /^Kids moved/)).toBeVisible();
  expect(log.sent('POST', '/categories/c-kids/move')).toEqual({
    parentId: null,
    afterId: 'c-jackets',
  });
});

test('a move a change meanwhile made impossible says so, and the list is read again', async ({
  page,
}, testInfo) => {
  computerOnly(testInfo);
  const log = await open(page);
  await refuseMoves(page);
  const reads = () =>
    log.calls.filter((call) => call.method === 'GET' && call.path === '/categories').length;
  const before = reads();
  await holdOver(page, 'Kids', 'Sarees', 0.1);
  await page.mouse.up();
  await expect(
    page.getByText(
      'Not moved: someone changed the categories meanwhile. The list is fresh now; try again.',
    ),
  ).toBeVisible();
  await expect.poll(reads).toBeGreaterThan(before);
});

test('a phone moves a category anywhere with Move to…, the impossible parents greyed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'a phone’s ⋯ menu');
  const log = await open(page);
  await expect(grip(page, 'Kids')).toBeHidden();
  await main(page).getByRole('button', { name: 'More for Kids' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to…' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Where Kids goes' })).toBeVisible();
  await expect(
    sheet.getByText("Its sub-categories move with it. The grey ones can't take it"),
  ).toBeVisible();
  // Kids and Baby are its own; under Formal or Slim fit it would be too deep.
  for (const name of ['Kids', 'Baby', 'Formal', 'Slim fit']) {
    await expect(sheet.getByRole('radio', { name })).toBeDisabled();
  }
  await expect(sheet.getByRole('radio', { name: 'Top level' })).toBeChecked();
  await expectAccessible(page);
  await sheet.getByRole('radio', { name: 'T-shirts' }).click();
  const where = sheet.getByLabel('Where in the list');
  await expect(where).toHaveValue('last');
  await expect(where.locator('option')).toHaveText(['First', 'After Men', 'Last']);
  await where.selectOption({ label: 'After Men' });
  await sheet.getByRole('button', { name: 'Done' }).click();
  expect(log.sent('POST', '/categories/c-kids/move')).toEqual({
    parentId: 'c-tshirts',
    afterId: 'c-men',
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(toast(page, /Kids is now inside T-shirts/)).toBeVisible();
});

test('someone who may only look has no grips and moves nothing', async ({ page }) => {
  await open(page, { isOwner: false, permissions: ['products:read'] });
  await expect(row(page, 'Kids')).toBeDisabled();
  await expect(main(page).getByRole('button', { name: /^Drag to move/ })).toHaveCount(0);
  await expect(main(page).getByText('Drag to arrange')).toHaveCount(0);
});
