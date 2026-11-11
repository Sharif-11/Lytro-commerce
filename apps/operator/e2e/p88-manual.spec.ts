import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { REVIEW_RENEWAL } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';
import { withBankAccount } from './support/p88-money-mock';

// OPERATOR-CONSOLE-DESIGN v7 §4b (ADM-14 to ADM-17, D8-47 to D8-56, D8-75), Phase 8 Slice 8.8: payments recorded by hand, to
// one of Lytro's numbers or its bank account, each entry's facts and evidence, reversing one, and a seller's screenshot in the
// payment queue.

const MONEY: ConsoleState = { paymentMethods: withBankAccount() };

function main(page: Page) {
  return page.getByRole('main');
}

function panel(page: Page) {
  return page.getByRole('dialog');
}

async function manual(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, { ...MONEY, ...state });
  await page.goto('/manual');
  await expect(main(page).getByRole('button', { name: 'Tanvir Mobiles' })).toBeVisible();
  return log;
}

async function startFor(page: Page, shopName: string): Promise<void> {
  await main(page).getByRole('button', { name: 'Record a payment' }).click();
  await panel(page).getByRole('searchbox').fill(shopName.slice(0, 5));
  await panel(page)
    .getByRole('button', { name: new RegExp(`^${shopName}`) })
    .click();
}

async function paidByBkash(page: Page, trx: string): Promise<void> {
  await panel(page).getByLabel('TrxID').fill(trx);
  await panel(page).getByLabel("Sender's number").fill('01815 345678');
  await panel(page).getByLabel('When it was paid').fill('2026-10-19T10:01');
}

test.describe('the list of manual entries', () => {
  test('shows each entry and reversal, newest first, with how it was paid and its evidence', async ({
    page,
  }) => {
    await manual(page);
    await expect(main(page).getByRole('heading', { name: 'Manual entries' })).toBeVisible();
    await expect(
      main(page).getByText('3 entries today. Past 10 a day, or over ৳10,000'),
    ).toBeVisible();
    const bank = main(page).locator('section > div').filter({ hasText: 'Tanvir Mobiles' });
    await expect(bank).toContainText('Renewal · Growth');
    await expect(bank).toContainText('BRAC-FT-55190327');
    await expect(bank).toContainText('Reference · BRAC Bank · 1501 2045 6789 001');
    const reversal = main(page)
      .locator('section > div')
      .filter({ hasText: 'Reverses the entry of 18 Oct 2026' });
    await expect(reversal).toContainText('−৳500');
    await expect(reversal).toContainText('nadia@lytro.app');
    await expect(reversal).toContainText('BKH3Z6X8C1');
    const reversed = main(page).locator('section > div').filter({ hasText: 'Reversed' }).last();
    await expect(reversed).toHaveClass(/text-fg-muted/);
  });

  test('filters by shop, by the operator signed in, and by day', async ({ page }) => {
    const log = await manual(page);
    await main(page).getByLabel('Who').selectOption('me');
    await expect(main(page).getByText('nadia@lytro.app')).toHaveCount(0);
    expect(log.calls.at(-1)?.query).toContain('operatorId=op-1');
    await main(page).getByLabel('Shop').selectOption({ label: 'Keya Boutique' });
    await expect(main(page).getByRole('button', { name: 'Keya Boutique' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Tanvir Mobiles' })).toHaveCount(0);
    await main(page).getByLabel('Shop').selectOption('');
    await main(page).getByLabel('From').fill('2026-10-21');
    await main(page).getByLabel('To').fill('2026-10-21');
    await expect(main(page).getByRole('button', { name: 'Sadia Collection' })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'Mehedi Books' })).toBeVisible();
  });

  test('says what fills it when it holds nothing', async ({ page }) => {
    await mockApi(page, { ...MONEY, manualEntries: [] });
    await page.goto('/manual');
    await expect(main(page).getByText('No entries')).toBeVisible();
    await expect(main(page).getByText('entries today')).toHaveCount(0);
  });

  test('offers a retry when the list fails', async ({ page }) => {
    await mockApi(page, { ...MONEY, failing: { '/operator/manual-entries': 503 } });
    await page.goto('/manual');
    await expect(main(page).getByText('The server did not answer')).toBeVisible();
  });
});

test.describe('recording a payment', () => {
  test('a plan is priced by the preview, its amount locked, and activates as the queue would', async ({
    page,
  }) => {
    const log = await manual(page);
    await startFor(page, 'Sadia Collection');
    await expect(
      panel(page).getByText('sadia-collection.lytro.app · Grace · Starter'),
    ).toBeVisible();
    await panel(page).locator('select[name=planId]').selectOption('p-starter');
    await panel(page).locator('select[name=billingTermId]').selectOption('t1');
    await expect(panel(page).getByText('Renewal · Starter v3 · 1 month · ৳449')).toBeVisible();
    await expect(panel(page).getByLabel('Amount that arrived')).toBeDisabled();
    await expect(panel(page).getByLabel('Amount that arrived')).toHaveValue('449');
    await paidByBkash(page, 'bkh7z2q8r1');
    await panel(page).getByLabel('Or type the statement line').fill('19/10 Cash In 449.00');
    const record = panel(page).getByRole('button', { name: 'Record ৳449' });
    await expect(record).toBeDisabled();
    await panel(page).getByLabel('Reason').fill('Sent at 9 pm with no phone online');
    await record.click();
    await expect(
      page.getByText('Payment recorded. Sadia Collection is on Starter until'),
    ).toBeVisible();
    expect(log.sent('POST', '/operator/manual-entries')).toEqual({
      tenantId: 'ten-0019',
      kind: 'plan',
      planId: 'p-starter',
      billingTermId: 't1',
      amount: 449,
      walletId: 'w1',
      senderNumber: '01815 345678',
      transactionId: 'bkh7z2q8r1',
      paidAt: '2026-10-19T04:01:00.000Z',
      evidenceLine: '19/10 Cash In 449.00',
      reason: 'Sent at 9 pm with no phone online',
    });
  });

  test('a transfer to Lytro bank account takes its reference and no sender (D8-75)', async ({
    page,
  }) => {
    const log = await manual(page);
    await startFor(page, 'Tanvir Mobiles');
    await panel(page).locator('select[name=planId]').selectOption('p-growth');
    await panel(page).locator('select[name=billingTermId]').selectOption('t6');
    await panel(page).getByText("Lytro's bank account").click();
    await expect(panel(page).getByLabel("Sender's number")).toHaveCount(0);
    await expect(panel(page).locator('select[name=bankAccountId]')).toHaveValue('b1');
    await expect(
      panel(page).getByText(
        'As the bank statement shows it. A bank transfer has no sender number.',
      ),
    ).toBeVisible();
    await panel(page).getByLabel("The transfer's reference").fill('BRAC-FT-77120001');
    await panel(page).getByLabel('When it was paid').fill('2026-10-21T11:30');
    await panel(page).getByLabel('Or type the statement line').fill('21-10-2026 BEFTN CR 3,984.00');
    await panel(page).getByLabel('Reason').fill('Paid by bank while bKash was down');
    await panel(page).getByRole('button', { name: 'Record ৳3,984' }).click();
    await expect(
      page.getByText('Payment recorded. Tanvir Mobiles is on Growth until'),
    ).toBeVisible();
    const sent = log.sent('POST', '/operator/manual-entries') as Record<string, unknown>;
    expect(sent).toMatchObject({ bankAccountId: 'b1', transactionId: 'BRAC-FT-77120001' });
    expect(sent).not.toHaveProperty('walletId');
    expect(sent).not.toHaveProperty('senderNumber');
  });

  test('a TrxID or reference already used is refused under its field', async ({ page }) => {
    await manual(page);
    await startFor(page, 'Sadia Collection');
    await paidByBkash(page, 'BKH4P2L9K7');
    await panel(page).getByLabel('Or type the statement line').fill('19/10 Cash In 449.00');
    await panel(page).getByLabel('Reason').fill('Sent at 9 pm');
    await panel(page)
      .getByRole('button', { name: /^Record ৳/ })
      .click();
    await expect(panel(page).getByText('This transaction ID has already been used.')).toBeVisible();

    await panel(page).getByText("Lytro's bank account").click();
    await panel(page).getByLabel("The transfer's reference").fill('BRAC-FT-55190327');
    await panel(page)
      .getByRole('button', { name: /^Record ৳/ })
      .click();
    await expect(panel(page).getByText('This reference has already been used.')).toBeVisible();
  });

  test('a price changed since the preview is refused at the top, with the new price', async ({
    page,
  }) => {
    await manual(page, { priceNow: '479.00' });
    await startFor(page, 'Sadia Collection');
    await paidByBkash(page, 'BKH7Z2Q8R1');
    await panel(page).getByLabel('Or type the statement line').fill('19/10 Cash In 449.00');
    await panel(page).getByLabel('Reason').fill('Sent at 9 pm');
    await panel(page)
      .getByRole('button', { name: /^Record ৳/ })
      .click();
    await expect(
      panel(page).getByText(
        'The price is now ৳479, not what you were shown. Check it, then record again.',
      ),
    ).toBeVisible();
  });

  test('a top-up over ৳10,000 asks for the amount again, and the two must match', async ({
    page,
  }) => {
    const log = await manual(page);
    await startFor(page, 'Mehedi Books');
    await panel(page).getByText('A top-up', { exact: true }).click();
    await expect(panel(page).locator('select[name=planId]')).toHaveCount(0);
    await panel(page).getByLabel('Amount that arrived').fill('12000');
    await expect(
      panel(page).getByText('Over ৳10,000: type the amount again to confirm.'),
    ).toBeVisible();
    await panel(page).getByLabel('The amount again').fill('12001');
    await expect(panel(page).getByText("The two amounts don't match.")).toBeVisible();
    await panel(page).getByLabel('The amount again').fill('12000');
    await paidByBkash(page, 'BKH9Q4L7M3');
    await panel(page).getByLabel('Or type the statement line').fill('Cash In 12,000.00');
    await panel(page).getByLabel('Reason').fill('The listener phone was off');
    await panel(page).getByRole('button', { name: 'Record ৳12,000' }).click();
    await expect(
      page.getByText("Payment recorded. ৳12,000 is on Mehedi Books's balance."),
    ).toBeVisible();
    expect(log.sent('POST', '/operator/manual-entries')).toMatchObject({
      kind: 'top_up',
      amount: 12000,
      amountConfirmation: 12000,
    });
  });

  test('a screenshot is sent to its signed link, and a wrong file is refused before', async ({
    page,
  }) => {
    const log = await manual(page);
    await startFor(page, 'Sadia Collection');
    const file = panel(page).locator('input[type=file]');
    await file.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('x'),
    });
    await expect(
      panel(page).getByText("That file can't be sent: JPG, PNG, WebP or PDF, up to 5 MB."),
    ).toBeVisible();
    await file.setInputFiles({
      name: 'bkash-sadia-1019.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(412 * 1024, 1),
    });
    await expect(panel(page).getByText('bkash-sadia-1019.jpg')).toBeVisible();
    await expect(panel(page).getByText(/412 KB · JPG, PNG, WebP or PDF/)).toBeVisible();
    expect(log.sent('POST', '/operator/manual-entries/evidence')).toEqual({
      contentType: 'image/jpeg',
      bytes: 412 * 1024,
    });
    await paidByBkash(page, 'BKH7Z2Q8R2');
    await panel(page).getByLabel('Reason').fill('Sent at 9 pm');
    await panel(page)
      .getByRole('button', { name: /^Record ৳/ })
      .click();
    await expect(page.getByText(/^Payment recorded/)).toBeVisible();
    expect(log.sent('POST', '/operator/manual-entries')).toMatchObject({
      evidenceKey: 'evidence/operator/e2e-shot',
    });
  });
});

test.describe('one entry', () => {
  test('a bank entry names its account and reference, and no sender', async ({ page }) => {
    await manual(page);
    await main(page).getByRole('button', { name: 'Tanvir Mobiles' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Renewal · ৳3,984' })).toBeVisible();
    await expect(panel(page).getByText('Reference', { exact: true })).toBeVisible();
    await expect(panel(page).getByText('BRAC Bank · 1501 2045 6789 001')).toBeVisible();
    await expect(panel(page).getByText('Sender', { exact: true })).toHaveCount(0);
    await expect(
      panel(page).getByText('21-10-2026 BEFTN CR 3,984.00 TANVIR MOBILES REF BRAC-FT-55190327'),
    ).toBeVisible();
  });

  test('opens its screenshot through a five-minute link', async ({ page }) => {
    const log = await manual(page);
    await main(page).getByRole('button', { name: 'Sadia Collection' }).click();
    await panel(page).getByRole('button', { name: 'Open the screenshot' }).click();
    await expect(
      panel(page).getByRole('heading', { name: 'Screenshot · BKH4P2L9K7' }),
    ).toBeVisible();
    await expect(panel(page).getByRole('img')).toBeVisible();
    expect(log.calls.some((call) => call.path === '/operator/manual-entries/me-28/evidence')).toBe(
      true,
    );
    await panel(page).getByRole('button', { name: 'Back' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Purchase · ৳449' })).toBeVisible();
  });

  test('says its screenshot was removed after two years', async ({ page }) => {
    await manual(page, { now: '2028-10-21T14:30:00+06:00' });
    await main(page).getByRole('button', { name: 'Sadia Collection' }).click();
    await expect(
      panel(page).getByText('This screenshot was removed after two years.'),
    ).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Open the screenshot' })).toHaveCount(0);
  });

  test('an entry already reversed says when, by whom and why, and has no Reverse', async ({
    page,
  }) => {
    await manual(page);
    await main(page).getByRole('button', { name: 'Arif Electronics' }).nth(1).click();
    await expect(
      panel(page).getByText(
        'Reversed 20 Oct 2026 by nadia@lytro.app: Recorded against the wrong shop; it was Arif Mobiles',
      ),
    ).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Reverse' })).toHaveCount(0);
  });
});

test.describe('reversing an entry', () => {
  test('a top-up comes off the balance; the reason goes to the owner', async ({ page }) => {
    const log = await manual(page);
    await main(page).getByRole('button', { name: 'Mehedi Books' }).click();
    await panel(page).getByRole('button', { name: 'Reverse' }).click();
    await expect(panel(page).getByText("৳2,000 comes off Mehedi Books's balance")).toBeVisible();
    await expect(
      panel(page).getByText(
        'Required. The owner reads it: it goes in their email and bell notice.',
      ),
    ).toBeVisible();
    await panel(page).getByLabel('Reason').fill('Recorded against the wrong shop');
    await panel(page).getByRole('button', { name: 'Reverse ৳2,000' }).click();
    await expect(page.getByText('Entry reversed. Mehedi Books was told.')).toBeVisible();
    expect(log.sent('POST', '/operator/manual-entries/me-30/reverse')).toEqual({
      reason: 'Recorded against the wrong shop',
    });
  });

  test('a plan that has moved on is refused in the server own words, at the top', async ({
    page,
  }) => {
    await manual(page, { planMovedOn: true });
    await main(page).getByRole('button', { name: 'Sadia Collection' }).click();
    await panel(page).getByRole('button', { name: 'Reverse' }).click();
    await expect(panel(page).getByText('goes back as it stood')).toBeVisible();
    await panel(page).getByLabel('Reason').fill('Wrong shop');
    await panel(page).getByRole('button', { name: 'Reverse ৳449' }).click();
    await expect(
      panel(page).getByText(
        "The shop's plan has changed since this entry, so it can't be put back.",
      ),
    ).toBeVisible();
  });
});

test.describe("the seller's screenshot in the queue", () => {
  test('a payment with one offers it, and its sheet warns it is only the seller word', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/queue/${REVIEW_RENEWAL}`);
    await expect(panel(page).getByText("The seller's screenshot")).toBeVisible();
    await panel(page).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/queue/${REVIEW_RENEWAL}\\?step=screenshot`));
    await expect(
      panel(page).getByText("A screenshot is the seller's word, not the money."),
    ).toBeVisible();
    await panel(page).getByRole('button', { name: 'Back' }).click();
    await expect(panel(page).getByText("The seller's screenshot")).toBeVisible();
  });

  test('a payment without one shows nothing for it', async ({ page }) => {
    await mockApi(page);
    await page.goto('/queue/pay-9104');
    await expect(panel(page).getByText('Keya Boutique', { exact: true })).toBeVisible();
    await expect(panel(page).getByText("The seller's screenshot")).toHaveCount(0);
  });
});

test('the manual entries page and its panel have no accessibility problems', async ({ page }) => {
  await manual(page);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await main(page).getByRole('button', { name: 'Record a payment' }).click();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
});
