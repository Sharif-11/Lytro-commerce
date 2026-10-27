import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ACTIVITY_GROUPS } from '@lytronix/validators';
import { drawnActivity } from './support/activity';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.15, Slice 11.6: Activity -- the timeline by day, one sentence an entry, the chips
// filtered on the server (AUD-04), Show earlier, and how long the plan keeps it (AUD-06). Each test runs on a phone
// and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/activity`);
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
}

function main(page: Page) {
  return page.getByRole('main');
}

/** Every GET /activity's query, in the order sent. */
function watchQueries(page: Page): URLSearchParams[] {
  const queries: URLSearchParams[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/activity') queries.push(url.searchParams);
  });
  return queries;
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

test('shows the entries by day, one sentence each, the failure marked, and the plan’s days', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText('Today', { exact: true })).toBeVisible();
  await expect(main(page).getByText('Yesterday', { exact: true })).toBeVisible();
  for (const sentence of [
    'Kamal changed stock',
    'Topped up ৳500',
    'Kamal signed in',
    'Rumana deactivated a staff member',
    'Rumana added a product',
  ]) {
    await expect(main(page).getByText(sentence)).toBeVisible();
  }
  // What the entry was about: a stock change's figures, a product's name.
  await expect(main(page).getByText('7 → 4')).toBeVisible();
  await expect(main(page).getByText('Silk saree')).toBeVisible();
  // AUD-03: a failure says so; nothing else shows its result.
  await expect(main(page).getByText('Sign-in failed')).toBeVisible();
  await expect(main(page).getByText('Failed', { exact: true })).toHaveCount(1);
  await expect(main(page).getByText('Starter keeps 30 days of activity.')).toBeVisible();
  await expectAccessible(page);
});

test('a chip asks the server for its group, so a page is never filtered in the browser', async ({
  page,
}) => {
  const queries = watchQueries(page);
  await open(page);
  expect(queries.at(-1)?.has('action')).toBe(false);

  await main(page).getByRole('button', { name: 'Money' }).click();
  await expect(main(page).getByText('Topped up ৳500')).toBeVisible();
  await expect(main(page).getByText('Kamal changed stock')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Money' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(queries.at(-1)?.get('action')?.split(',')).toEqual([...ACTIVITY_GROUPS.money]);

  await main(page).getByRole('button', { name: 'Failed only' }).click();
  await expect(main(page).getByText('Sign-in failed')).toBeVisible();
  await expect(main(page).getByText('Topped up ৳500')).toHaveCount(0);
  expect(queries.at(-1)?.get('result')).toBe('failure');
  expect(queries.at(-1)?.has('action')).toBe(false);
});

test('Show earlier brings the older page and goes when there is none', async ({ page }) => {
  const queries = watchQueries(page);
  await open(page);
  await main(page).getByRole('button', { name: 'Show earlier' }).click();
  await expect(main(page).getByText('Rumana signed in')).toBeVisible();
  expect(queries.at(-1)?.get('cursor')).toBe('older');
  await expect(main(page).getByRole('button', { name: 'Show earlier' })).toHaveCount(0);
});

test('a new shop with nothing yet says what will show', async ({ page }) => {
  await open(page, { activity: { entries: [], earlier: [] } });
  await expect(
    main(page).getByText('No activity yet. Sign-ins, changes and payments will show here.'),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Show earlier' })).toHaveCount(0);
  await expect(main(page).getByText('Starter keeps 30 days of activity.')).toBeVisible();
  await expectAccessible(page);
});

test('a chip with nothing in it says so, and Show all goes back to everything', async ({
  page,
}) => {
  const succeeded = drawnActivity('en').filter((each) => each.result !== 'failure');
  await open(page, { activity: { entries: succeeded, earlier: [] } });
  await main(page).getByRole('button', { name: 'Failed only' }).click();
  await expect(main(page).getByText('Nothing failed in this period.')).toBeVisible();
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Show all' }).click();
  await expect(main(page).getByText('Kamal changed stock')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('another chip with nothing in it says nothing of its kind happened', async ({ page }) => {
  await open(page, { activity: { entries: [], earlier: [] } });
  await main(page).getByRole('button', { name: 'Products and stock' }).click();
  await expect(main(page).getByText('Nothing of this kind in this period.')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Show all' })).toBeVisible();
});
