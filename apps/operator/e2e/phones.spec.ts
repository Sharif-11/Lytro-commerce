import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnReceipts, REVIEW_RENEWAL } from './support/console-data';
import { mockApi } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §10a: Lytro's own phones, what they forwarded, and what they couldn't read.

function main(page: Page) {
  return page.getByRole('main');
}

test.describe('the phones', () => {
  test('lists them, and warns of one offline', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones');
    await expect(main(page).getByRole('heading', { name: "Lytro's phones" })).toBeVisible();
    await expect(main(page).getByText('Lytro bKash phone')).toBeVisible();
    await expect(main(page).getByText('Online')).toBeVisible();
    await expect(
      main(page)
        .getByRole('status')
        .getByText(/Lytro Nagad phone has been offline 41 min/),
    ).toBeVisible();
  });

  test('moves between its three screens', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones');
    await main(page).getByRole('link', { name: 'Receipts' }).click();
    await expect(page).toHaveURL('/phones/receipts');
    await main(page).getByRole('link', { name: 'Unreadable messages' }).click();
    await expect(page).toHaveURL('/phones/unread');
    await main(page).getByRole('link', { name: 'Phones' }).click();
    await expect(page).toHaveURL('/phones');
  });

  test('pairing asks for a code as it opens, and for another on request', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/phones');
    await page.getByRole('button', { name: 'Pair a phone' }).click();
    const panel = page.getByRole('dialog', { name: 'Pair a phone' });
    await expect(panel.getByText('K7F2M9Q1')).toBeVisible();
    await expect(panel.getByText('Works once. Runs out at 21 Oct, 14:40.')).toBeVisible();
    await panel.getByRole('button', { name: 'New code' }).click();
    await expect(panel.getByText('K7F2M9Q2')).toBeVisible();
    await panel.getByRole('button', { name: 'Done' }).click();
    await expect(panel).toBeHidden();
    expect(log.state.pairingCodes).toBe(2);
  });

  test('a code that does not come says so', async ({ page }) => {
    await mockApi(page, { failing: { '/operator/lytro-listener/pairing-codes': 503 } });
    await page.goto('/phones');
    await page.getByRole('button', { name: 'Pair a phone' }).click();
    await expect(
      page.getByRole('dialog').getByText("The code didn't come. Try again."),
    ).toBeVisible();
  });

  test('revokes and blocks, as on a shop', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/phones');
    await main(page).getByRole('button', { name: 'Revoke' }).first().click();
    // D7-20: Lytro's own phones tell no shop.
    await expect(page.getByRole('dialog', { name: 'Revoke Lytro bKash phone?' })).not.toContainText(
      'The shop is told',
    );
    await page
      .getByRole('dialog', { name: 'Revoke Lytro bKash phone?' })
      .getByRole('button', { name: 'Revoke' })
      .click();
    await expect(page.getByRole('status').getByText('Lytro bKash phone is revoked.')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Revoke' })).toHaveCount(1);

    await main(page).getByRole('button', { name: 'Block' }).click();
    const block = page.getByRole('dialog', { name: 'Block this app installation?' });
    await expect(block.getByText('inst-3c77ab10')).toBeVisible();
    await block.getByRole('textbox', { name: 'Reason' }).fill('Lost');
    await block.getByRole('button', { name: 'Block everywhere' }).click();
    await expect(main(page).getByRole('button', { name: 'Block' })).toHaveCount(0);
    expect(log.sent('POST', '/operator/listener-installations/block')).toEqual({
      installationId: 'inst-3c77ab10',
      reason: 'Lost',
    });
  });

  test('with none paired, says every payment waits for you', async ({ page }) => {
    await mockApi(page, { lytroPhones: [] });
    await page.goto('/phones');
    await expect(main(page).getByText('No phones paired')).toBeVisible();
    await expect(main(page).getByText('waits in the queue for you')).toBeVisible();
  });

  test('a read that fails offers a retry', async ({ page }) => {
    const log = await mockApi(page, { failing: { '/operator/lytro-listener/devices': 503 } });
    await page.goto('/phones');
    await expect(page.getByText('The server did not answer')).toBeVisible();
    log.state.failing = {};
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(main(page).getByText('Lytro bKash phone')).toBeVisible();
  });
});

test.describe('the receipts', () => {
  test('lists what came, newest first as sent, with its phone by name', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/receipts');
    await expect(main(page).getByRole('button', { name: '৳448' })).toBeVisible();
    await expect(main(page).getByText('BKH7A2M9Q1')).toBeVisible();
    await expect(main(page).getByText('01712345678 · bKash')).toBeVisible();
    await expect(main(page).getByText('Lytro Nagad phone')).toBeVisible();
    await expect(main(page).getByText('Not a receipt')).toBeVisible();
  });

  test('filters by status, with the counts', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/phones/receipts');
    await expect(main(page).getByRole('button', { name: /^All/ })).toContainText('5');
    const unclaimed = main(page).getByRole('button', { name: /^Unclaimed/ });
    await expect(unclaimed).toContainText('1');
    await unclaimed.click();
    await expect(main(page).getByText('NGD7W2E5R9')).toBeVisible();
    await expect(main(page).getByText('BKH7A2M9Q1')).toHaveCount(0);
    expect(log.calls.some((call) => call.query.includes('status=unmatched'))).toBe(true);
  });

  test('searches, and the counts follow', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/receipts');
    await main(page).getByRole('searchbox').fill('NGD7');
    await expect(main(page).getByText('NGD7W2E5R9')).toBeVisible();
    await expect(main(page).getByText('BKH7A2M9Q1')).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: /^All/ })).toContainText('1');
  });

  test('pages through a long list', async ({ page }) => {
    const log = await mockApi(page);
    const first = drawnReceipts()[0] as Record<string, unknown>;
    log.state.receipts = Array.from({ length: 45 }, (_, index) => ({
      ...first,
      id: `r-${String(index)}`,
      transactionId: `TRX${String(index).padStart(3, '0')}`,
    }));
    await page.goto('/phones/receipts');
    await expect(main(page).getByText('Page 1 of 3')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await main(page).getByRole('button', { name: 'Next' }).click();
    await expect(main(page).getByText('Page 2 of 3')).toBeVisible();
    await expect(main(page).getByText('TRX020')).toBeVisible();
    await expect(main(page).getByText('TRX000')).toHaveCount(0);
  });

  test('a new search starts again from the first page', async ({ page }) => {
    const log = await mockApi(page);
    const first = drawnReceipts()[0] as Record<string, unknown>;
    log.state.receipts = Array.from({ length: 45 }, (_, index) => ({
      ...first,
      id: `r-${String(index)}`,
    }));
    await page.goto('/phones/receipts');
    await main(page).getByRole('button', { name: 'Next' }).click();
    await expect(main(page).getByText('Page 2 of 3')).toBeVisible();
    await main(page).getByRole('searchbox').fill('BKH');
    await expect(main(page).getByText('Page 1 of 3')).toBeVisible();
  });

  test('a filter starts again from the first page', async ({ page }) => {
    const log = await mockApi(page);
    const first = drawnReceipts()[0] as Record<string, unknown>;
    log.state.receipts = Array.from({ length: 45 }, (_, index) => ({
      ...first,
      id: `r-${String(index)}`,
    }));
    await page.goto('/phones/receipts');
    await main(page).getByRole('button', { name: 'Next' }).click();
    await expect(main(page).getByText('Page 2 of 3')).toBeVisible();
    await main(page)
      .getByRole('button', { name: /^With you/ })
      .click();
    await expect(main(page).getByText('Page 1 of 3')).toBeVisible();
  });

  test('one that needs review opens its payment', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/receipts');
    await main(page).getByRole('button', { name: '৳448' }).click();
    const panel = page.getByRole('dialog', { name: '৳448 · bKash' });
    await expect(panel.getByText("The amount isn't what was quoted.")).toBeVisible();
    await expect(panel.getByText('You have received Tk 448.00', { exact: false })).toBeVisible();
    await panel.getByRole('button', { name: 'Open the payment' }).click();
    await expect(page).toHaveURL(`/queue/${REVIEW_RENEWAL}`);
  });

  test('one already used has no payment waiting to open', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/receipts');
    await main(page).getByRole('button', { name: /^Used/ }).click();
    await main(page).getByRole('button', { name: '৳699' }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Open the payment' }),
    ).toHaveCount(0);
  });

  test('one whose text has gone says so', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/receipts');
    await main(page)
      .getByRole('button', { name: /^Duplicate/ })
      .click();
    await main(page).getByRole('button', { name: '৳699' }).click();
    await expect(page.getByRole('dialog').getByText('Its text has been removed')).toBeVisible();
  });

  test('nothing here says what fills it', async ({ page }) => {
    await mockApi(page, { receipts: [] });
    await page.goto('/phones/receipts');
    await expect(main(page).getByText('No receipts here')).toBeVisible();
  });
});

test.describe('the unreadable messages', () => {
  test('lists each wording by day, and says when you were told', async ({ page }) => {
    await mockApi(page);
    await page.goto('/phones/unread');
    await expect(main(page).getByText('Cash In Tk # from #.', { exact: false })).toBeVisible();
    await expect(main(page).getByText('23 messages')).toBeVisible();
    await expect(main(page).getByText('You were told')).toHaveCount(1);
  });

  test('reads the period chosen', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/phones/unread');
    await main(page).getByRole('button', { name: 'Last 30 days' }).click();
    await expect(main(page).getByRole('button', { name: 'Last 30 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => log.calls.some((call) => call.query === '?days=30')).toBe(true);
  });

  test('nothing unreadable says so', async ({ page }) => {
    await mockApi(page, { unread: [] });
    await page.goto('/phones/unread');
    await expect(main(page).getByText('Nothing unreadable')).toBeVisible();
  });
});

test('in Bangla, it is too', async ({ page }) => {
  await mockApi(page, { language: 'bn' });
  await page.goto('/phones');
  await expect(main(page).getByRole('heading', { name: 'Lytro-র ফোন' })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'রিসিট' })).toBeVisible();
  await page.goto('/phones/receipts');
  await expect(main(page).getByRole('button', { name: /^দাবি হয়নি/ })).toBeVisible();
});

test('has no accessibility problems', async ({ page }) => {
  await mockApi(page);
  await page.goto('/phones');
  await expect(main(page).getByText('Lytro bKash phone')).toBeVisible();
  let found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
  await page.goto('/phones/receipts');
  await expect(main(page).getByText('BKH7A2M9Q1')).toBeVisible();
  found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
});
