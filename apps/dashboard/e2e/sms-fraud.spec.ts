import { expect, test, type Page } from '@playwright/test';
import { SmsEvent } from '@lytronix/validators';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { mockOnboarding } from './support/onboarding-api';
import type { Phase7Fixture } from './support/phase7';

// TENANT-DASHBOARD-DESIGN §7.40, Phase 7 Slice 7.7 (Part 37): SMS settings, its sheets, log and report; the SMS an action
// sends and the order's own; the fake order check on the order, New order, the customer and its rule in Settings; reading a
// message on New order; the reads allowance in the add-on shop and on Usage; Balance's rates as the server has them; and the
// sign-in code the balance can't pay for. Against a mocked API, on a phone and a desktop.

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

async function open(
  page: Page,
  path: string,
  phase7: Phase7Fixture = {},
  state: ShopState = {},
): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state, phase7 });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

test.describe('SMS settings', () => {
  test('the SMS to customers and to the owner, each with its sample, parts and estimate', async ({
    page,
  }) => {
    await open(page, '/settings/sms');
    await expect(main(page).getByText('To your customers', { exact: true })).toBeVisible();
    await expect(main(page).getByText('To you', { exact: true })).toBeVisible();
    const placed = main(page).getByRole('button', { name: /^Order placed/ });
    await expect(placed).toContainText('Megh Fashion: অর্ডার 261106-0017 পেয়েছি');
    await expect(placed).toContainText('1 part');
    await expect(
      main(page).getByRole('switch', { name: 'Delivered', exact: true }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('a switch saves at once', async ({ page }) => {
    const log = await open(page, '/settings/sms');
    await main(page).getByRole('switch', { name: 'Delivered', exact: true }).click();
    await expect(page.getByText('SMS settings saved')).toBeVisible();
    expect(log.phase7.sms).toEqual([{ events: { order_delivered: true } }]);
  });

  test("own words: the sample and cost as typed, the order number kept, back to Lytro's", async ({
    page,
  }) => {
    const log = await open(page, '/settings/sms');
    await main(page)
      .getByRole('button', { name: /^Order placed/ })
      .click();
    const words = sheet(page, 'SMS: Order placed');
    const box = words.getByLabel('Words');
    await box.fill('Thanks! We got your order.');
    await words.getByRole('button', { name: 'Save' }).click();
    await expect(
      words.getByText('Keep the order number, so each SMS says which order it is about.'),
    ).toBeVisible();
    expect(log.phase7.sms).toEqual([]);
    await box.fill('Thanks! Order [Order number] is in, total ৳[Amount].');
    await expect(words).toContainText('Thanks! Order 261106-0017 is in, total ৳1,250.');
    await words.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('SMS settings saved')).toBeVisible();
    expect(log.phase7.sms.at(-1)).toEqual({
      events: { order_placed: true },
      templates: { order_placed: 'Thanks! Order {order_number} is in, total ৳{amount}.' },
    });
  });

  test('the monthly cap is at least ৳1, counted over the cycle the server names', async ({
    page,
  }) => {
    const log = await open(page, '/settings/sms');
    await expect(main(page).getByText(/order SMS stop until 1 Dec/)).toBeVisible();
    await main(page).getByRole('button', { name: 'Set a cap' }).click();
    const cap = sheet(page, 'Monthly SMS cap');
    await cap.getByLabel('Monthly SMS cap').fill('0.5');
    await cap.getByRole('button', { name: 'Save' }).click();
    await expect(cap.getByText('Enter at least ৳1.')).toBeVisible();
    await cap.getByLabel('Monthly SMS cap').fill('300');
    await cap.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('SMS settings saved')).toBeVisible();
    expect(log.phase7.sms.at(-1)).toEqual({ monthlySpendCap: 300 });
  });

  test('staff who may read: the switches as words, no Edit', async ({ page }) => {
    await open(page, '/settings/sms', {}, { isOwner: false, permissions: ['sms:read'] });
    await expect(
      main(page).getByText('The owner, or staff allowed to, can change SMS settings.'),
    ).toBeVisible();
    await expect(main(page).getByRole('switch')).toHaveCount(0);
  });

  test('the log: sent, failed and blocked, a code never shown', async ({ page }) => {
    await open(page, '/settings/sms?tab=log');
    await expect(main(page).getByText('Sent', { exact: true }).first()).toBeVisible();
    await expect(main(page).getByText('Failed', { exact: true })).toBeVisible();
    await expect(main(page).getByText('Blocked', { exact: true })).toBeVisible();
    await expect(main(page).getByText('The code is never shown')).toBeVisible();
    // Each row's order by its number, from the server.
    await expect(main(page).getByRole('link', { name: '#261031-0047' }).first()).toHaveAttribute(
      'href',
      `/${SLUG}/orders/o-47`,
    );
  });

  test('the report by kind', async ({ page }) => {
    await open(page, '/settings/sms?tab=report');
    await expect(main(page).getByText('Order placed').first()).toBeVisible();
    await expect(main(page).getByText('Order shipped').first()).toBeVisible();
  });
});

test.describe('The SMS an action sends', () => {
  test('cancelling says the customer is told, or that the SMS is off', async ({ page }) => {
    await open(page, '/orders/o-46');
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await sheet(page, /^Order #/)
      .getByRole('button', { name: 'Cancel the order' })
      .click();
    await expect(sheet(page, 'Cancel the order?')).toContainText(
      'The customer is told by SMS that it is cancelled · ৳0.55 from the balance',
    );
  });

  test('cancelling with its SMS off says so', async ({ page }) => {
    await open(page, '/orders/o-46', { sms: { on: { [SmsEvent.OrderCancelled]: false } } });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await sheet(page, /^Order #/)
      .getByRole('button', { name: 'Cancel the order' })
      .click();
    await expect(sheet(page, 'Cancel the order?')).toContainText(
      'The "Order cancelled" SMS is off, so the customer gets none.',
    );
  });

  test('New order says the Order placed SMS it sends; the order shows its own SMS', async ({
    page,
  }) => {
    await open(page, '/orders/new');
    await expect(
      main(page).getByText(/the customer gets the "Order placed" SMS · ৳0.55 from the balance/),
    ).toBeVisible();
    await page.goto(`/${SLUG}/orders/o-47`);
    await expect(main(page).getByRole('heading', { name: 'SMS on this order' })).toBeVisible();
  });
});

test.describe('The fake order check', () => {
  test('the order: the automatic result in its customer card, figures only, Check again', async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', { fraud: { order: { state: 'done' } } });
    await expect(main(page).getByText('Checked by itself when the order came')).toBeVisible();
    await expect(main(page).getByText('82%')).toBeVisible();
    await expect(main(page).getByText('3 delivered · 1 returned · 0 cancelled')).toBeVisible();
    await main(page).getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText('Phone checked')).toBeVisible();
    expect(log.phase7.checks).toEqual(['+8801711234567']);
  });

  test('being checked, and skipped under the smallest amount', async ({ page }) => {
    await open(page, '/orders/o-47', { fraud: { order: { state: 'pending' } } });
    await expect(main(page).getByText(/Being checked/)).toBeVisible();
    await open(page, '/orders/o-47', {
      fraud: { order: { state: 'skipped', reason: 'below_minimum' } },
    });
    await expect(
      main(page).getByText("Not checked by itself: orders under ৳500 aren't checked."),
    ).toBeVisible();
  });

  test("Check again refused for the minute, in the server's words", async ({ page }) => {
    await open(page, '/orders/o-47', {
      fraud: { order: { state: 'done' }, run: { refused: 'minute' } },
    });
    await main(page).getByRole('button', { name: 'Check again' }).click();
    await expect(
      main(page).getByText('Too many phones checked in the last minute. Try again shortly.'),
    ).toBeVisible();
  });

  test('staff who see the order but may not check: the figures, no button', async ({ page }) => {
    await open(
      page,
      '/orders/o-47',
      { fraud: { order: { state: 'done' } } },
      { isOwner: false, permissions: ['orders:read'] },
    );
    await expect(
      main(page).getByText('The owner, or staff allowed to, can check again.'),
    ).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Check again' })).toHaveCount(0);
  });

  test('New order: a valid phone offers the check, which never runs by itself', async ({
    page,
  }) => {
    const log = await open(page, '/orders/new', { fraud: { run: { reports: 2, doubtful: true } } });
    await main(page).getByLabel('Phone number').fill('1711 234 567');
    await main(page).getByRole('button', { name: 'Check this number' }).click();
    await expect(main(page).getByText('2 merchants reported this number')).toBeVisible();
    await expect(main(page).getByText('Steadfast marks it doubtful')).toBeVisible();
    expect(log.phase7.checks).toEqual(['01711234567']);
  });

  test("New order: a known number's last check, asking no one", async ({ page }) => {
    const log = await open(page, '/orders/new', {
      fraud: { latest: { '01711234567': { figures: [91, 6, 3], own: [4, 0, 0], cached: true } } },
    });
    await main(page).getByLabel('Phone number').fill('1711 234 567');
    await expect(main(page).getByText('91%')).toBeVisible();
    await expect(main(page).getByText(/Steadfast's answer from/)).toBeVisible();
    expect(log.phase7.checks).toEqual([]);
  });

  test("the customer's page, never checked", async ({ page }) => {
    await open(page, '/customers/c-nusrat');
    await expect(main(page).getByText("This number hasn't been checked yet.")).toBeVisible();
  });

  test('Settings: the automatic check, from a smallest amount, saved', async ({ page }) => {
    const log = await open(page, '/settings/fraud-checks');
    await expect(main(page).getByText('Where the figures come from')).toBeVisible();
    await main(page).getByLabel('Only from this amount (optional)').fill('500');
    await main(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Automatic check settings saved.')).toBeVisible();
    expect(log.phase7.rule).toEqual({ codOrders: true, minAmount: '500' });
  });
});

test.describe('Reading a message', () => {
  test('read: the fields filled, a thana that matched nothing to pick, the cost', async ({
    page,
  }) => {
    const log = await open(page, '/orders/new');
    await main(page)
      .getByRole('textbox', { name: "From the customer's message" })
      .fill('Hi, I want to order. Name Sadia Islam, phone 01812-445566.');
    await main(page).getByRole('button', { name: 'Read the details' }).click();
    await expect(main(page).getByText(/Filled 5 of 6 from the message/)).toBeVisible();
    await expect(main(page).getByLabel(/Phone number/)).toHaveValue('1812 445 566');
    await expect(main(page).getByLabel(/^Name/)).toHaveValue('Sadia Islam');
    await expect(
      main(page).getByText('The message says "Fatulla", which matches no thana. Pick the thana.'),
    ).toBeVisible();
    await expect(main(page).getByText('Check this').first()).toBeVisible();
    expect(log.phase7.reads).toHaveLength(1);
  });

  test('nothing found costs nothing; nothing pasted is refused before it is sent', async ({
    page,
  }) => {
    const log = await open(page, '/orders/new', { read: 'none' });
    await main(page).getByRole('button', { name: 'Read the details' }).click();
    await expect(main(page).getByText('Paste the message first.')).toBeVisible();
    expect(log.phase7.reads).toHaveLength(0);
    await main(page)
      .getByRole('textbox', { name: "From the customer's message" })
      .fill('How much is it?');
    await main(page).getByRole('button', { name: 'Read the details' }).click();
    await expect(
      main(page).getByText('Nothing to fill in was found in the message. Nothing was charged.'),
    ).toBeVisible();
  });

  test('no balance and no reads left: Top up, or buy 200 reads', async ({ page }) => {
    await open(page, '/orders/new', { read: 'nobal' });
    await main(page)
      .getByRole('textbox', { name: "From the customer's message" })
      .fill('Sadia 01812445566');
    await main(page).getByRole('button', { name: 'Read the details' }).click();
    await expect(main(page).getByText(/The balance can't pay for a read \(৳0.10\)/)).toBeVisible();
    await expect(main(page).getByRole('link', { name: '200 reads' })).toBeVisible();
  });
});

test.describe('The reads allowance', () => {
  test('the add-on shop: Pay per use, bought from the sheet', async ({ page }) => {
    await open(page, '/addons', { readsOffered: true });
    await expect(main(page).getByText('Pay per use')).toBeVisible();
    await expect(main(page).getByText('Address reads from messages · 200')).toBeVisible();
    // D7-64: 20 days left of the month buy 130 reads for ৳13, not the catalogue's 200.
    await expect(
      main(page).getByText('130 reads this period, used before the balance'),
    ).toBeVisible();
    // The reads row's own Buy: the smallest block holding both its name and the button.
    await main(page)
      .locator('div')
      .filter({ has: page.getByText('Address reads from messages · 200', { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Buy' }) })
      .last()
      .getByRole('button', { name: 'Buy' })
      .click();
    await expect(page.getByRole('dialog')).toContainText('0 → 130');
    await page.getByRole('dialog').getByRole('button', { name: / \+$/ }).click();
    await expect(page.getByRole('dialog')).toContainText('0 → 270');
  });

  test('active: the reads left', async ({ page }) => {
    await open(page, '/addons', { readsOffered: true, reads: { used: 57 } });
    await expect(main(page).getByText('143 of 200 left')).toBeVisible();
  });

  test('Usage: reads against the pack, and at 90% the banner', async ({ page }) => {
    await open(page, '/usage', { reads: { used: 57 } });
    await expect(main(page).getByText(/57 of 200 · until/)).toBeVisible();
    await expect(main(page).getByText('Then ৳0.10 a read from the balance')).toBeVisible();
    await open(page, '/usage', { reads: { used: 180 }, readsOffered: true });
    await expect(main(page).getByText(/Address reads at 90%: 20 left until/)).toBeVisible();
  });

  test("Usage with no pack: the rate and this cycle's reads", async ({ page }) => {
    await open(page, '/usage');
    await expect(main(page).getByText('No pack · ৳0.10 a read · 23 this cycle')).toBeVisible();
  });
});

test.describe('Balance and sign-in, as the server has them', () => {
  test("Balance's rates: an address read, the fake order check free, no chat AI", async ({
    page,
  }) => {
    await open(page, '/balance');
    await expect(main(page).getByText('Address read from a message').first()).toBeVisible();
    await expect(main(page).getByText('Free for now')).toBeVisible();
    await expect(main(page).getByText('Chat AI reply')).toHaveCount(0);
  });

  test("sign-in: a code the shop's balance can't pay for, in the server's words; a password instead", async ({
    page,
  }) => {
    await mockOnboarding(page, { language: 'en', codeUnpaid: true });
    await page.goto('/sign-in');
    await expect(page.getByText(/then ৳0.55 from its balance/)).toBeVisible();
    await page.getByLabel('Phone number').fill('1711 234 567');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText("Your shop's balance can't pay for this code.", { exact: false }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('link', { name: 'Use a different number' })
        .or(page.getByRole('button', { name: 'Use a different number' })),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Use a password instead' }).click();
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});
