import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { RAHIM } from './support/console-data';
import { mockApi, type ApiLog } from './support/mock-api';

// Slice 9.9 (the approved sketch, docs/brand/lytro-operator.html "Phase 9 · Slice 9.9"): limited mode on Today, the money
// check, limited mode's divider and Lytro's VAT in Settings, and the credential uses as a CSV.

const main = (page: Page) => page.getByRole('main');
const toast = (page: Page, words: string) => page.getByRole('status').getByText(words);
const lastCall = (log: ApiLog, method: string, path: string) =>
  [...log.calls].reverse().find((call) => call.method === method && call.path === path);

test.describe('limited mode on Today (D9-14)', () => {
  test('says it is off, with the money check under it, and turns on after saying what pauses', async ({
    page,
  }) => {
    const log = await mockApi(page);
    await page.goto('/');
    const card = main(page).locator('section').filter({ hasText: 'Limited mode' }).first();
    await expect(card).toContainText('Off. Every shop works as usual.');
    await expect(card).toContainText("While on, every shop's per-minute limits ÷2");
    await expect(card).toContainText('Money check · 3 open');

    await card.getByRole('button', { name: 'Turn on' }).click();
    const panel = page.getByRole('dialog', { name: 'Turn limited mode on?' });
    await expect(panel).toContainText('Exports and CSV downloads · the reports');
    await expect(panel).toContainText('Orders · payments and their verification');
    await expect(panel).toContainText('No email or SMS goes out.');
    await panel.getByRole('button', { name: 'Turn on' }).click();
    await expect(
      toast(page, 'Limited mode is on. Every dashboard shows the banner.'),
    ).toBeVisible();
    expect(log.sent('PUT', '/operator/degraded-mode')).toEqual({ on: true });
    await expect(card).toContainText('On since');
    await expect(card).toContainText('ops@lytro.app');

    await card.getByRole('button', { name: 'Turn off' }).click();
    const off = page.getByRole('dialog', { name: 'Turn limited mode off?' });
    await off.getByRole('button', { name: 'Turn off' }).click();
    await expect(toast(page, 'Limited mode is off. The banner is gone.')).toBeVisible();
    expect(log.sent('PUT', '/operator/degraded-mode')).toEqual({ on: false });
  });

  test('says when everything matched, and links the divider to Settings', async ({ page }) => {
    await mockApi(page, { differences: [] });
    await page.goto('/');
    await expect(main(page)).toContainText('Money check · Everything matched at 06:00.');
    await main(page).getByRole('link', { name: 'Change in Settings' }).click();
    await expect(page).toHaveURL(/\/settings#settings-group-16$/);
  });
});

test.describe('the money check (DAT-52)', () => {
  test('lists the open differences with the shop, the day and the amounts, from Today', async ({
    page,
  }, testInfo) => {
    await mockApi(page);
    await page.goto('/');
    // On a desktop the menu carries it with its count; a phone reaches it from More, or from Today's card.
    if (testInfo.project.name === 'desktop') {
      await expect(
        page.getByRole('navigation').getByRole('link', { name: /Money check/ }),
      ).toContainText('3');
    }
    await main(page)
      .getByRole('link', { name: /Money check/ })
      .click();
    await expect(page).toHaveURL('/money-check');
    await expect(page.getByRole('heading', { name: 'Money check' })).toBeVisible();
    await expect(main(page)).toContainText('Checked 20 Oct 2026 at 06:00');
    await expect(main(page)).toContainText('No invoice, or more than one');
    await expect(main(page)).toContainText('mehedi-books.lytro.app');
    await expect(main(page)).toContainText('No invoice');
    await expect(main(page)).toContainText('৳500.00');
    await expect(main(page)).toContainText("Lytro's own");
    await expect(main(page).getByRole('link', { name: 'Open the receipt' })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations).toEqual([]);
  });

  test('narrows to a kind, and asks the server for it', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/money-check');
    await main(page)
      .getByRole('combobox', { name: 'Every kind' })
      .selectOption('top_up_credit_mismatch');
    await expect(main(page)).toContainText('Top-up credited wrong');
    // The kind picker names every kind; the rows are what narrowed.
    await expect(main(page)).not.toContainText('mehedi-books.lytro.app');
    const call = lastCall(log, 'GET', '/operator/reconciliation/differences');
    expect(new URLSearchParams(call?.query).get('kind')).toBe('top_up_credit_mismatch');
  });

  test('resolves a difference only with a note, which then shows with who resolved it', async ({
    page,
  }) => {
    const log = await mockApi(page);
    await page.goto('/money-check');
    await main(page).getByRole('button', { name: 'Mark resolved' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Mark this difference resolved?' });
    await panel.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(panel).toContainText('Write what you found or did first.');
    await panel.getByRole('textbox').fill('Issued the missing invoice by hand.');
    await panel.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(toast(page, 'Resolved. It moved to Resolved.')).toBeVisible();
    expect(log.sent('POST', '/operator/reconciliation/differences/diff-invoice/resolve')).toEqual({
      note: 'Issued the missing invoice by hand.',
    });
    await main(page)
      .getByRole('button', { name: /^Resolved/ })
      .click();
    await expect(main(page)).toContainText('Resolved by ops@lytro.app');
    await expect(main(page)).toContainText('Issued the missing invoice by hand.');
  });

  test('says when there is nothing to check', async ({ page }) => {
    await mockApi(page, { differences: [] });
    await page.goto('/money-check');
    await expect(main(page)).toContainText('Nothing to check');
  });
});

test.describe('limited mode and VAT in Settings (D9-14, D9-7)', () => {
  test('shows the divider and refuses one outside 2 to 10', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/settings');
    const group = main(page).locator('#settings-group-16');
    await expect(group).toContainText('÷2 while on');
    await group.getByRole('button', { name: 'Change: Per-minute limits divided by' }).click();
    await group.getByRole('textbox', { name: 'Per-minute limits divided by' }).fill('11');
    await group.getByRole('textbox', { name: 'Reason' }).fill('Heavier day');
    await group.getByRole('button', { name: 'Save' }).click();
    await expect(group).toContainText('A whole number from 2 to 10.');
    expect(log.sent('PATCH', '/operator/settings/degraded_factor')).toBeUndefined();
  });

  test("shows VAT isn't on invoices yet, refuses a BIN that isn't one, and sends a good one as text", async ({
    page,
  }) => {
    const log = await mockApi(page);
    await page.goto('/settings');
    const group = main(page).locator('#settings-group-17');
    await expect(group).toContainText('Not shown on invoices: 0 of 4 set');
    await expect(group).toContainText('Tax invoice (Mushak-6.3)');
    await expect(group).toContainText('VAT included (15%)');
    await expect(group).toContainText('৳58.57');
    const name = 'VAT registration number (BIN)';
    await group.getByRole('button', { name: `Change: ${name}` }).click();
    await group.getByRole('textbox', { name }).fill('12345678');
    await group.getByRole('textbox', { name: 'Reason' }).fill('Registered');
    await group.getByRole('button', { name: 'Save' }).click();
    await expect(group).toContainText('A BIN is 9 digits, or 13 with the branch.');
    await group.getByRole('textbox', { name }).fill('123456789-0101');
    await group.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() => log.sent('PATCH', '/operator/settings/vat_bin'))
      .toMatchObject({
        value: '123456789-0101',
      });
  });
});

test.describe("the shop's credential uses as a CSV (SEC-11)", () => {
  test('offers the last 30 days, refuses days out of order, and downloads named by the days', async ({
    page,
  }) => {
    const log = await mockApi(page);
    await page.goto(`/shops/${RAHIM}/credentials`);
    await expect(main(page)).toContainText(
      'This list shows gateway keys only; the CSV also has couriers and Meta.',
    );
    await main(page).getByRole('button', { name: 'Download CSV' }).click();
    const panel = page.getByRole('dialog', { name: 'Credential uses as a CSV' });
    const from = panel.getByLabel('From');
    const to = panel.getByLabel('To');
    await expect(from).toHaveValue('2026-09-22');
    await expect(to).toHaveValue('2026-10-21');

    await to.fill('2026-09-01');
    await expect(panel).toContainText('"To" can’t be before "From".');
    await expect(panel.getByRole('button', { name: 'Download' })).toBeDisabled();
    await panel.getByRole('button', { name: 'Last 30 days' }).click();
    await expect(to).toHaveValue('2026-10-21');

    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toBe(
      'credential-uses-2026-09-22-to-2026-10-21.csv',
    );
    await expect(toast(page, 'The CSV is downloading.')).toBeVisible();
    const call = lastCall(log, 'GET', `/operator/tenants/${RAHIM}/credential-uses.csv`);
    expect(new URLSearchParams(call?.query).get('dateFrom')).toBe('2026-09-22');
    expect(new URLSearchParams(call?.query).get('dateTo')).toBe('2026-10-21');
  });
});
