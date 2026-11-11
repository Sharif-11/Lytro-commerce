import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ApiLog, type ConsoleState } from './support/mock-api';
import {
  alertedMediaCosts,
  NADIA_ID,
  noEmailMediaCosts,
  offMediaCosts,
  OPERATOR_ID,
} from './support/p88-records-mock';

// OPERATOR-CONSOLE-DESIGN v7 §10e to §10g, Phase 8 Slice 8.8: the Records pages over Slice 8.4's reports and audit log and
// Slice 8.6's media costs (ADM-08, ADM-09, MED-12), and Today's platform figures.

function main(page: Page) {
  return page.getByRole('main');
}

function isPhone(): boolean {
  return test.info().project.name === 'phone';
}

/** The query of the last read of this path. */
function lastQuery(log: ApiLog, path: string): URLSearchParams {
  const call = [...log.calls].reverse().find((each) => each.path === path);
  return new URLSearchParams(call?.query ?? '');
}

async function open(page: Page, path: string, state: ConsoleState = {}): Promise<ApiLog> {
  const log = await mockApi(page, state);
  await page.goto(path);
  return log;
}

test.describe('reports', () => {
  test('open on this month by week: what was earned, each week, and how the total is made', async ({
    page,
  }) => {
    const log = await open(page, '/reports');
    await expect(main(page).getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const query = lastQuery(log, '/operator/reports/revenue');
    expect(query.get('dateFrom')).toBe('2026-10-01');
    expect(query.get('dateTo')).toBe('2026-10-21');
    expect(query.get('bucket')).toBe('week');
    await expect(main(page)).toContainText('৳54,739.80');
    await expect(main(page)).toContainText('Plans, less reversals · ৳3,000 in top-ups too');
    const total = main(page)
      .locator('section > div')
      .filter({ hasText: /^Total/ });
    await expect(total).toContainText('−৳50.70');
    await expect(main(page)).toContainText('How the total is made');
    await expect(main(page)).toContainText('Spending from balances is counted from 3 Oct 2026');
    // Recorded by hand opens the manual entries.
    await main(page)
      .getByRole('link', { name: /Recorded by hand/ })
      .click();
    await expect(page).toHaveURL('/manual');
  });

  test('a preset sets the days and its split; the days and the split can be changed', async ({
    page,
  }) => {
    const log = await open(page, '/reports');
    await main(page).getByRole('button', { name: 'This year' }).click();
    await expect(main(page)).toContainText('January');
    let query = lastQuery(log, '/operator/reports/revenue');
    expect(query.get('dateFrom')).toBe('2026-01-01');
    expect(query.get('bucket')).toBe('month');
    await main(page).getByLabel('Split by').selectOption('quarter');
    await expect
      .poll(() => lastQuery(log, '/operator/reports/revenue').get('bucket'))
      .toBe('quarter');
    await main(page).getByLabel('From').fill('2026-09-15');
    await expect
      .poll(() => lastQuery(log, '/operator/reports/revenue').get('dateFrom'))
      .toBe('2026-09-15');
    query = lastQuery(log, '/operator/reports/revenue');
    expect(query.get('dateTo')).toBe('2026-10-21');
    // Typed days are no preset.
    await expect(main(page).getByRole('button', { name: 'This year' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('shops: by state and plan now, and those that came and went', async ({ page }) => {
    await open(page, '/reports?view=shops');
    await expect(main(page)).toContainText('By state, now');
    await expect(main(page)).toContainText('412');
    await expect(main(page)).toContainText('Pay-as-you-go');
    const total = main(page)
      .locator('section > div')
      .filter({ hasText: /^Total/ });
    await expect(total).toContainText('59');
    await expect(total).toContainText('14');
    await expect(total).toContainText('8');
  });

  test('top consumers: the 20 shops by what they used, each with the owner phone', async ({
    page,
  }) => {
    const log = await open(page, '/reports?view=consumers');
    await expect(main(page)).toContainText('Faiza Shoes');
    await expect(main(page)).toContainText('01611 223300');
    await expect(main(page)).toContainText('7.9 GB');
    await main(page).getByRole('button', { name: 'SMS' }).click();
    await expect(main(page)).toContainText('4,200 SMS units');
    expect(lastQuery(log, '/operator/reports/consumers').get('metric')).toBe('sms');
  });

  test("Export saves the open tab's CSV for the period shown, named as the server names it", async ({
    page,
  }) => {
    const log = await open(page, '/reports?view=shops');
    await expect(main(page)).toContainText('412');
    const download = page.waitForEvent('download');
    await main(page).getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toBe(
      'lytro-shops-2026-10-01-to-2026-10-21-week.csv',
    );
    const query = lastQuery(log, '/operator/reports/shops/export');
    expect(query.get('bucket')).toBe('week');
  });

  test('a period with nothing in it says so', async ({ page }) => {
    await open(page, '/reports', { reportsEmpty: true });
    await expect(main(page)).toContainText('None.');
    await expect(main(page)).toContainText("It won't match the wallet statements");
  });
});

test.describe('the audit log', () => {
  test('lists every action newest first: when, what with its summary, which shop and who', async ({
    page,
  }) => {
    await open(page, '/audit');
    await expect(main(page)).toContainText(
      "7 days · 19 Oct 2026 → 26 Oct 2026 · bKash was down for two days; the owner couldn't renew",
    );
    await expect(main(page)).toContainText('media_budget_usd: 10 → 15 · Two new shops with video');
    await expect(main(page)).toContainText('Lytro, by itself');
    await expect(main(page)).toContainText('The shop owner');
    await expect(main(page)).toContainText('Upay · Upay settlements to shops have stalled');
    await expect(main(page)).toContainText('−৳150 · SMS charged twice on 18 Oct');
  });

  test('narrows by who, action and days, and "Only mine" is the signed-in operator', async ({
    page,
  }) => {
    const log = await open(page, '/audit');
    await expect(main(page)).toContainText('Plan extended');
    await main(page).getByLabel('Who').selectOption({ label: 'Only mine' });
    await expect.poll(() => lastQuery(log, '/operator/audit').get('actorId')).toBe(OPERATOR_ID);
    await expect(main(page)).not.toContainText('nadia@lytro.app');
    await main(page).getByLabel('Action').selectOption({ label: 'Setting changed' });
    await expect
      .poll(() => lastQuery(log, '/operator/audit').get('action'))
      .toBe('settings_changed');
    await main(page).getByLabel('From').fill('2026-10-21');
    await expect.poll(() => lastQuery(log, '/operator/audit').get('dateFrom')).toBe('2026-10-21');
    await expect(page).toHaveURL(/actorId=/);
  });

  test('an entry opens with its summary named, and narrows to its person or its shop', async ({
    page,
  }) => {
    const log = await open(page, '/audit');
    await main(page).getByRole('button', { name: 'Plan extended' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Plan extended' });
    await expect(panel).toContainText('Brought back');
    await expect(panel).toContainText('Yes');
    await expect(panel).toContainText('tenant · ten-0019');
    await panel.getByRole('button', { name: "Only this shop's" }).click();
    await expect(panel).toBeHidden();
    await expect.poll(() => lastQuery(log, '/operator/audit').get('tenantId')).toBe('ten-0019');
    await expect(
      main(page).getByRole('button', { name: 'Remove the filter: Sadia Collection' }),
    ).toBeVisible();
    await main(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL('/audit');
  });

  test("another operator's entries show their address as a filter", async ({ page }) => {
    await open(page, `/audit?actorId=${NADIA_ID}`);
    await expect(
      main(page).getByRole('button', { name: 'Remove the filter: nadia@lytro.app' }),
    ).toBeVisible();
    await expect(main(page).getByLabel('Who')).toHaveValue('');
  });

  test('loads older entries, and says when nothing matches', async ({ page }) => {
    const log = await open(page, '/audit');
    await main(page).getByRole('button', { name: 'Load 20 more' }).click();
    await expect.poll(() => lastQuery(log, '/operator/audit').get('cursor')).toBe('9300');
    await expect(main(page).getByRole('button', { name: 'Load 20 more' })).toBeHidden();
    await page.goto('/audit?action=courier_removed');
    await expect(main(page)).toContainText('Nothing matches these filters');
  });
});

test.describe('media costs', () => {
  test("this period's estimate against the budget, R2 by bucket and the Worker", async ({
    page,
  }) => {
    await open(page, '/media-costs');
    await expect(main(page)).toContainText('$5.81');
    await expect(main(page)).toContainText('21 of 31 days read');
    await expect(main(page)).toContainText('58% of the budget');
    await expect(main(page)).toContainText('The alert goes at 80% · ops@lytro.app');
    await expect(main(page)).toContainText('0.62 million · 1 million free · 0 billable');
    await expect(main(page)).toContainText('Shop media');
    await expect(main(page)).toContainText('Payment screenshots');
    await expect(main(page)).toContainText('Account, not a bucket');
    await expect(main(page)).toContainText('11.3 million');
  });

  test('past the alert it says where the alert went, marked for a person', async ({ page }) => {
    await open(page, '/media-costs', { mediaCosts: alertedMediaCosts() });
    await expect(main(page).getByRole('status').first()).toContainText(
      'The alert went to ops@lytro.app on 19 Oct 2026, at 80% of the budget.',
    );
    await expect(main(page).locator('.text-warning').first()).toHaveText('$8.40');
  });

  test('with no alert address it says so and opens Settings', async ({ page }) => {
    await open(page, '/media-costs', { mediaCosts: noEmailMediaCosts() });
    await expect(main(page)).toContainText(
      'No alert address is set, so at 80% the alert is only logged.',
    );
    await expect(main(page)).toContainText('The alert goes at 80% · Not set');
    await main(page).getByRole('link', { name: 'Set it in Settings' }).click();
    await expect(page).toHaveURL('/settings');
  });

  test("without Cloudflare it says R2 wasn't read and shows the Worker alone", async ({ page }) => {
    await open(page, '/media-costs', { mediaCosts: offMediaCosts() });
    await expect(main(page)).toContainText("Cloudflare isn't connected");
    await expect(main(page)).not.toContainText('R2 storage');
    await expect(main(page)).not.toContainText('Buckets');
    await expect(main(page)).toContainText('The media Worker');
  });

  test('a past period can be read', async ({ page }) => {
    const log = await open(page, '/media-costs');
    await main(page).getByLabel('Billing period').selectOption('2026-09-01');
    await expect
      .poll(() => lastQuery(log, '/operator/media-costs').get('period'))
      .toBe('2026-09-01');
  });
});

test("Today's platform figures come from this month's reports and open them", async ({ page }) => {
  await open(page, '/');
  const card = main(page).locator('section', { hasText: 'Platform figures' });
  await expect(card).toContainText('This month so far, from the reports');
  await expect(card).toContainText('412');
  await expect(card).toContainText('59');
  await expect(card).toContainText('৳54,739.8');
  await card.getByRole('link', { name: 'Open reports' }).click();
  await expect(page).toHaveURL('/reports');
});

test('the Records pages read in Bangla', async ({ page }) => {
  await open(page, '/audit', { language: 'bn' });
  await expect(main(page)).toContainText('মেয়াদ বাড়ানো');
  await expect(main(page)).toContainText('দুই দিন bKash বন্ধ ছিল');
  await page.goto('/media-costs');
  await expect(main(page)).toContainText('বাজেটের 58%');
  await page.goto('/reports');
  await expect(main(page)).toContainText('মোটটা কীভাবে হলো');
});

test('no Records page scrolls sideways on a phone, and none has an accessibility problem', async ({
  page,
}) => {
  await mockApi(page);
  for (const path of [
    '/reports',
    '/reports?view=shops',
    '/reports?view=consumers',
    '/audit',
    '/media-costs',
  ]) {
    await page.goto(path);
    await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
    await expect(main(page).locator('[aria-busy=true]')).toHaveCount(0);
    if (isPhone()) {
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, path).toBeLessThanOrEqual(clientWidth);
    }
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.map((violation) => violation.id),
      path,
    ).toEqual([]);
  }
});
