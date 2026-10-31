import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { meghOrders, type OrderFixture } from './support/orders';

// TENANT-DASHBOARD-DESIGN §7.31, Slice 4.8a (the prototype's `orders`, `order` and Part 29; ORD-09 to ORD-52): the list
// with the day's work first, More with the cancel reasons, the search and the dates; the order with its customer,
// calls, items, money and timeline, and one next step; the call and how it went, Call later, cancel, delete, delivered
// and hand over. The mocked day is Part 29's at Megh Fashion. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const row = (page: Page, number: string) =>
  main(page).getByRole('link', { name: new RegExp(`^#${number}`) });

function sent(log: ApiLog, method: string, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body as Record<string, unknown>);
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

/** Longer than the search's pause before it writes the address (250 ms). */
const SEARCH_SETTLED_MS = 600;

/** The order's more menu, then one of its rows. */
async function fromMenu(page: Page, item: string): Promise<void> {
  await main(page)
    .getByRole('button', { name: /^Order #/ })
    .click();
  await sheet(page, /^Order #/)
    .getByRole('button', { name: item })
    .click();
}

test('the list puts the day first: To confirm with each tab counted, the rows under their day, More for the rest', async ({
  page,
}) => {
  const log = await open(page, '/orders');
  const tabs = main(page).getByRole('group');
  await expect(tabs.getByRole('button', { name: /^To confirm/ })).toContainText('3');
  await expect(tabs.getByRole('button', { name: /^Confirmed/ })).toContainText('1');
  await expect(tabs.getByRole('button', { name: /^All/ })).toContainText('9');
  await expect(row(page, '261031-0047')).toContainText('Nusrat Jahan');
  await expect(row(page, '261031-0047')).toContainText('Mirpur, Dhaka · 2 items');
  await expect(row(page, '261031-0047')).toContainText('৳3,470');
  await expect(row(page, '261031-0047')).toContainText('New');
  await expect(row(page, '261031-0046')).toContainText('No answer ×2');
  await expect(row(page, '261031-0045')).toContainText('Takeaway');
  await expect(main(page)).toContainText('Today');
  await expectAccessible(page);

  await tabs.getByRole('button', { name: /^On hold/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders?tab=hold`);
  await expect(row(page, '261031-0043')).toContainText(/Call at /);

  await tabs.getByRole('button', { name: /^All/ }).click();
  await expect(main(page)).toContainText('Yesterday');
  await expect(main(page)).toContainText('Earlier');

  // Delivered, Returned and Cancelled sit under More; Cancelled by its reason (ORD-52).
  await tabs.getByRole('button', { name: /^More/ }).click();
  const more = sheet(page, 'More orders');
  await expect(more.getByRole('button', { name: /^Delivered/ })).toContainText('1');
  await expect(more.getByRole('button', { name: /^Fake order/ })).toContainText('1');
  await more.getByRole('button', { name: /^Fake order/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders?tab=cancelled&reason=fake_order`);
  await expect(row(page, '261029-0031')).toContainText('Fake order');
  await expect(tabs.getByRole('button', { name: /^Cancelled/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(log.calls.some((call) => call.query.includes('cancelReason=fake_order'))).toBe(true);
});

test('the search finds by name, phone or number, and the dates narrow to the days placed', async ({
  page,
}) => {
  const log = await open(page, '/orders?tab=all');
  await main(page).getByLabel('Name, phone or order number').fill('Rakib');
  await expect(page).toHaveURL(`/${SLUG}/orders?tab=all&q=Rakib`);
  await expect(row(page, '261031-0046')).toBeVisible();
  await expect(row(page, '261031-0047')).toHaveCount(0);
  await main(page).getByLabel('Name, phone or order number').fill('zzz');
  await expect(main(page)).toContainText('No order matches.');
  await main(page).getByLabel('Name, phone or order number').fill('');

  await main(page).getByRole('button', { name: 'Dates' }).click();
  const dates = sheet(page, 'Orders placed');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  await dates.getByLabel('From').fill(today);
  await dates.getByRole('button', { name: 'Show orders' }).click();
  await expect(page).toHaveURL(new RegExp(`from=${today}`));
  await expect(main(page).getByRole('button', { name: 'Dates' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row(page, '261030-0039')).toHaveCount(0);
  await expect(row(page, '261031-0047')).toBeVisible();
  expect(log.calls.some((call) => call.query.includes(`dateFrom=${today}`))).toBe(true);
  // The search's pause, still running when the dates were chosen, ends without undoing them.
  await page.waitForTimeout(SEARCH_SETTLED_MS);
  await expect(page).toHaveURL(`/${SLUG}/orders?tab=all&from=${today}`);
});

test("the order: who and where, the customer's note, the items with a combo inside, the money with the tax in it", async ({
  page,
}) => {
  await open(page, '/orders/o-47');
  await expect(main(page)).toContainText('#261031-0047');
  await expect(main(page)).toContainText('Storefront');
  await expect(main(page)).toContainText('Call the customer to confirm.');
  await expect(main(page)).toContainText('Nusrat Jahan');
  await expect(main(page)).toContainText('01711 234 567');
  await expect(main(page)).toContainText('House 5, Road 10, Mirpur 11 · Mirpur, Dhaka');
  await expect(main(page)).toContainText("Customer's note");
  await expect(main(page)).toContainText('Please call after 2 pm');
  await expect(main(page)).toContainText('4 orders');
  await expect(main(page)).toContainText('No calls yet');
  await expect(main(page)).toContainText('Inside: Cotton panjabi · M, Check lungi');
  await expect(main(page)).toContainText('+ Gift wrap ৳50');
  await expect(main(page)).toContainText('2 × ৳450');
  await expect(main(page)).toContainText('Delivery · Inside Dhaka');
  await expect(main(page)).toContainText('Includes VAT 5% ৳42.86');
  await expect(main(page)).toContainText('Cash on delivery৳3,470');
  await expect(main(page)).toContainText(
    "No payments yet. Cash on delivery is taken when it's delivered.",
  );
  await expect(main(page)).toContainText('You add the courier and tracking code when you ship.');
  await expect(main(page)).toContainText('Order placed');
  // Later phases' pieces are drawn greyed, and hidden here (agreed in the 4.8a read).
  await expect(main(page)).not.toContainText('Phase 7');
  await expect(main(page).getByRole('link', { name: 'Call to confirm' })).toHaveAttribute(
    'href',
    'tel:+8801711234567',
  );
  await expectAccessible(page);
});

test('a call is logged as it went: no answer keeps the order and counts the call; confirmed confirms it', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-47');
  await main(page).getByRole('link', { name: 'Call to confirm' }).click();
  const call = sheet(page, 'How did the call go?');
  await expect(call).toContainText('You called Nusrat · 01711 234 567');
  await expectAccessible(page);
  await call.getByRole('radio', { name: /^No answer/ }).click();
  await call.getByLabel('Note (optional)').fill('Rang out');
  await call.getByRole('button', { name: 'Save the call' }).click();
  await expect(page.getByText('No answer · The order stays as it is')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-47/calls')).toEqual([
    { outcome: 'no_answer', note: 'Rang out' },
  ]);
  await expect(main(page)).toContainText('No answer ×1');
  await expect(main(page)).toContainText('Rang out');

  await main(page).getByRole('link', { name: 'Call to confirm' }).click();
  await sheet(page, 'How did the call go?').getByRole('button', { name: 'Save the call' }).click();
  await expect(page.getByText('Confirmed · #261031-0047')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-47/calls').at(-1)).toEqual({ outcome: 'confirmed' });
  await expect(main(page)).not.toContainText('Call the customer to confirm.');
});

test('call later holds the order till a time; the hold is released from the menu', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-47');
  await main(page).getByRole('link', { name: 'Call to confirm' }).click();
  await sheet(page, 'How did the call go?')
    .getByRole('radio', { name: /^Call later/ })
    .click();
  const later = sheet(page, 'Call later');
  await expect(later.getByRole('button', { name: 'Save the call' })).toBeDisabled();
  await later.getByRole('button', { name: 'Tomorrow, 10 am' }).click();
  await later.getByRole('button', { name: 'Save the call' }).click();
  const [body] = sent(log, 'POST', '/orders/o-47/calls');
  expect(body).toMatchObject({ outcome: 'call_back_later' });
  // Ten in the morning tomorrow, on Dhaka's clock.
  expect(new Date(String(body?.callBackAt)).getUTCHours()).toBe(4);
  await expect(main(page)).toContainText('Due a call at');
  await expect(main(page).getByRole('link', { name: 'Call again' })).toBeVisible();

  await fromMenu(page, 'Release the hold');
  expect(sent(log, 'POST', '/orders/o-47/override')).toEqual([{ override: null }]);
  await expect(main(page)).not.toContainText('Due a call at');
});

test('cancelling asks the reason, Other with a note, and says it lets the stock go', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-46');
  await fromMenu(page, 'Cancel the order');
  const cancel = sheet(page, 'Cancel the order?');
  await expect(cancel).toContainText('Cancelling lets go of the stock it holds.');
  await expect(cancel.getByRole('button', { name: 'Cancel the order' })).toBeDisabled();
  await cancel.getByRole('radio', { name: 'Other' }).click();
  await expect(cancel.getByRole('button', { name: 'Cancel the order' })).toBeDisabled();
  await cancel.getByLabel('Note (optional)').fill('Ordered twice by mistake');
  await cancel.getByRole('button', { name: 'Cancel the order' }).click();
  expect(sent(log, 'POST', '/orders/o-46/cancel')).toEqual([
    { reason: 'other', note: 'Ordered twice by mistake' },
  ]);
  await expect(main(page)).toContainText('Cancelled · Other · Ordered twice by mistake');
  // A cancelled order is final: no next step, and only its label in the menu.
  await expect(main(page).getByRole('link', { name: /Call/ })).toHaveCount(0);
  await main(page)
    .getByRole('button', { name: /^Order #/ })
    .click();
  await expect(
    sheet(page, /^Order #/)
      .getByRole('button')
      .filter({ hasText: /\S/ }),
  ).toHaveText(['Print label']);
});

test('a mistake is deleted after the question, and the list no longer has it', async ({ page }) => {
  const log = await open(page, '/orders/o-47');
  await fromMenu(page, 'Delete the order');
  const ask = page.getByRole('dialog', { name: 'Delete order #261031-0047?' });
  await expect(ask).toContainText('Its number is never used again.');
  await ask.getByRole('button', { name: 'Delete the order' }).click();
  await expect(page.getByText('Order #261031-0047 deleted')).toBeVisible();
  await expect(page).toHaveURL(`/${SLUG}/orders`);
  expect(log.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  await expect(row(page, '261031-0047')).toHaveCount(0);
});

test('a shipped order is marked delivered, the cash on delivery recorded', async ({ page }) => {
  const log = await open(page, '/orders/o-39');
  await expect(main(page)).toContainText('Steadfast');
  await expect(main(page)).toContainText('SF-2610-4471');
  await main(page).getByRole('button', { name: 'Delivered', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'Mark it delivered?' });
  await expect(ask).toContainText('The courier collected ৳1,650 cash on delivery');
  await ask.getByRole('button', { name: 'Delivered' }).click();
  await expect(page.getByText('Delivered · ৳1,650 cash on delivery recorded')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-39/deliver')).toHaveLength(1);
  await expect(main(page)).toContainText('Paid');
  await expect(main(page)).toContainText('৳1,650 · Cash on delivery');
});

test('a takeaway is handed over at the counter: no calls or shipping, its cash taken in one step', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-45');
  await expect(main(page)).toContainText('At the counter · Takeaway');
  await expect(main(page)).not.toContainText('No calls yet');
  await expect(main(page)).not.toContainText('Shipping');
  await main(page).getByRole('button', { name: 'Hand over' }).click();
  const ask = page.getByRole('dialog', { name: 'Handing it to Karim?' });
  await expect(ask).toContainText('Take ৳650 in cash.');
  await ask.getByRole('button', { name: 'Hand over' }).click();
  await expect(page.getByText('Delivered · ৳650 Cash')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-45/hand-over')).toEqual([{}]);
  await expect(main(page)).toContainText('Handed over');
});

test('someone who may only look sees no next step, and only Print label in the menu', async ({
  page,
}) => {
  await open(page, '/orders/o-47', { isOwner: false, permissions: ['orders:read'] });
  await expect(main(page)).toContainText('#261031-0047');
  await expect(main(page).getByRole('link', { name: 'Call to confirm' })).toHaveCount(0);
  await main(page)
    .getByRole('button', { name: /^Order #/ })
    .click();
  const menu = sheet(page, /^Order #/);
  await expect(menu.getByRole('button').filter({ hasText: /\S/ })).toHaveText(['Print label']);
  // Selecting orders to print, and entering one, are for someone who may manage them.
  await page.goto(`/${SLUG}/orders`);
  await expect(main(page).getByRole('button', { name: 'Select' })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: 'New order' })).toHaveCount(0);
});

/** Part 29's day with one order changed for a test. */
function day(change: (orders: OrderFixture[]) => void): ShopState {
  const fixture = meghOrders();
  change(fixture.orders);
  return { orders: fixture };
}

function order(orders: OrderFixture[], id: string): OrderFixture {
  const found = orders.find((each) => each.id === id);
  if (!found) throw new Error(id);
  return found;
}

const IMEIS = ['356938035643809', '356938035643817', '356938035643825'] as const;

test('Mark shipped: a recent courier in one tap, a tracking code, and the stock out', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-44');
  await main(page).getByRole('button', { name: 'Mark shipped' }).click();
  const ship = sheet(page, 'Mark shipped');
  await expect(ship).toContainText(
    "Shipping takes the stock out, and it counts as one of this month's orders.",
  );
  await expect(ship.getByRole('button', { name: 'Mark shipped' })).toBeDisabled();
  // The shop's couriers, the most recent first (ORD-09).
  await expect(ship.getByRole('button', { name: /^(Steadfast|Pathao)$/ })).toHaveText([
    'Steadfast',
    'Pathao',
  ]);
  await ship.getByRole('button', { name: 'Steadfast', exact: true }).click();
  await expect(ship.getByLabel('Courier')).toHaveValue('Steadfast');
  await expectAccessible(page);
  await ship.getByLabel('Tracking code').fill('SF-2610-4471');
  await ship.getByRole('button', { name: 'Mark shipped' }).click();
  await expect(page.getByText('Shipped · Steadfast · SF-2610-4471')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-44/ship')).toEqual([
    { courierName: 'Steadfast', trackingCode: 'SF-2610-4471' },
  ]);
  await expect(main(page).getByRole('button', { name: 'Delivered', exact: true })).toBeVisible();
  await expect(main(page)).toContainText('SF-2610-4471');
});

test("Mark shipped asks the IMEI of each unit, and says when the month's limit is passed", async ({
  page,
}) => {
  const log = await open(
    page,
    '/orders/o-44',
    day((orders) => {
      const confirmed = order(orders, 'o-44');
      confirmed.items = [
        {
          name: ['স্মার্ট ওয়াচ', 'Smart watch'],
          quantity: 2,
          unitPrice: 1890,
          serials: { inStock: [...IMEIS], sent: [] },
        },
      ];
      confirmed.limitOnShip = 300;
    }),
  );
  await main(page).getByRole('button', { name: 'Mark shipped' }).click();
  const ship = sheet(page, 'Mark shipped');
  await ship.getByLabel('Courier').fill('Pathao');
  await ship.getByLabel('Or a tracking link').fill('https://merchant.pathao.com/t/PTH-88213');
  await expect(ship).toContainText('The IMEI you send');
  await expect(ship).toContainText('Smart watch · 2 units · One for each unit');
  await ship.getByRole('button', { name: IMEIS[0] }).click();
  await expect(ship).toContainText('1 of 2 picked');
  await expect(ship.getByRole('button', { name: 'Mark shipped' })).toBeDisabled();
  await ship.getByRole('button', { name: IMEIS[2] }).click();
  // Two units, two serials: a third cannot be picked.
  await expect(ship.getByRole('button', { name: IMEIS[1] })).toBeDisabled();
  await ship.getByRole('button', { name: 'Mark shipped' }).click();
  expect(sent(log, 'POST', '/orders/o-44/ship')).toEqual([
    {
      courierName: 'Pathao',
      trackingLink: 'https://merchant.pathao.com/t/PTH-88213',
      serials: [{ lineId: 'o-44-line-0', serials: [IMEIS[0], IMEIS[2]] }],
    },
  ]);
  await expect(main(page)).toContainText("You've passed this month's 300 orders.");
  await expect(main(page).getByRole('link', { name: 'See plans' })).toBeVisible();
});

test('Return items: units back sellable or damaged, the order Returned once all are back', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-38');
  await main(page).getByRole('button', { name: 'Return items' }).click();
  const back = sheet(page, 'Return items');
  await expect(back).toContainText(
    'Sellable items go back into stock; damaged ones are written off.',
  );
  await expect(back.getByRole('button', { name: 'Take them back' })).toBeDisabled();
  await back.getByRole('button', { name: 'Denim jacket Damaged +' }).click();
  // One unit was sent: a sellable one too would be more than came.
  await expect(back.getByRole('button', { name: 'Denim jacket Sellable +' })).toBeDisabled();
  await back.getByLabel('Note (optional)').fill('Torn seam');
  await expectAccessible(page);
  await back.getByRole('button', { name: 'Take them back' }).click();
  await expect(page.getByText('1 item taken back')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-38/returns')).toEqual([
    { items: [{ lineId: 'o-38-line-0', sellable: 0, damaged: 1 }], note: 'Torn seam' },
  ]);
  await expect(main(page)).toContainText('1 returned');
  await expect(main(page).getByRole('button', { name: 'Return items' })).toHaveCount(0);
});

test('a combo comes back whole, any item in it ticked damaged; an IMEI by its serial', async ({
  page,
}) => {
  const log = await open(
    page,
    '/orders/o-38',
    day((orders) => {
      order(orders, 'o-38').items = [
        {
          name: ['ঈদ কম্বো', 'Eid combo'],
          quantity: 1,
          unitPrice: 2500,
          inside: [
            ['কটন পাঞ্জাবি · M', 'Cotton panjabi · M'],
            ['চেক লুঙ্গি', 'Check lungi'],
          ],
        },
        {
          name: ['স্মার্ট ওয়াচ', 'Smart watch'],
          quantity: 2,
          unitPrice: 1890,
          serials: { inStock: [], sent: [IMEIS[0], IMEIS[1]] },
        },
      ];
    }),
  );
  await main(page).getByRole('button', { name: 'Return items' }).click();
  const back = sheet(page, 'Return items');
  await expect(back).toContainText('A combo comes back whole.');
  // An item inside is ticked only once a combo is coming back.
  await expect(back.getByRole('checkbox', { name: 'Check lungi' })).toBeDisabled();
  await back.getByRole('button', { name: 'Combos that came back +' }).click();
  await back.getByRole('checkbox', { name: 'Check lungi' }).check();
  await expect(back).toContainText('2 sent');
  await back.getByRole('checkbox', { name: IMEIS[0] }).check();
  await back.getByRole('checkbox', { name: IMEIS[1] }).check();
  await back.getByRole('button', { name: 'Damaged' }).last().click();
  await expect(back).toContainText('1 sellable · 1 damaged');
  await back.getByRole('button', { name: 'Take them back' }).click();
  expect(sent(log, 'POST', '/orders/o-38/returns')).toEqual([
    {
      items: [
        {
          lineId: 'o-38-line-0',
          sellable: 1,
          damaged: 0,
          components: [{ variantId: 'cv-0-2', damaged: 1 }],
        },
        {
          lineId: 'o-38-line-1',
          sellable: 1,
          damaged: 1,
          serials: { sellable: [IMEIS[0]], damaged: [IMEIS[1]] },
        },
      ],
    },
  ]);
  await expect(page.getByText('3 items taken back')).toBeVisible();
});

test('Record payment by bKash, no more than is due; a mistaken one is voided and stays struck through', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-44');
  await main(page).getByRole('button', { name: 'Record payment' }).click();
  const pay = sheet(page, 'Record a payment');
  await pay.getByRole('button', { name: 'bKash' }).click();
  await expect(pay).toContainText('৳3,780 is due. More than that is refused.');
  await pay.getByLabel('Amount').fill('5000');
  await pay.getByLabel('Sent from').fill('1819 876 543');
  await pay.getByLabel('TrxID').fill('9F2KQ7M1');
  await expect(pay.getByRole('button', { name: 'Save' })).toBeDisabled();
  await pay.getByLabel('Amount').fill('500');
  await expectAccessible(page);
  await pay.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('৳500 bKash recorded')).toBeVisible();
  expect(sent(log, 'POST', '/orders/o-44/payments')).toEqual([
    {
      method: 'bkash',
      amount: '500.00',
      senderNumber: '+8801819876543',
      transactionId: '9F2KQ7M1',
    },
  ]);
  await expect(main(page)).toContainText('৳500 · TrxID 9F2KQ7M1');

  await main(page).getByRole('button', { name: 'Void' }).click();
  const voiding = sheet(page, 'Void this payment?');
  await expect(voiding.getByRole('button', { name: 'Void' })).toBeDisabled();
  await voiding.getByLabel('Why you void it').fill('The wrong TrxID was typed');
  await voiding.getByRole('button', { name: 'Void' }).click();
  expect(sent(log, 'POST', '/orders/o-44/payments/o-44-pay-0/void')).toEqual([
    { reason: 'The wrong TrxID was typed' },
  ]);
  await expect(main(page)).toContainText('Voided: The wrong TrxID was typed');
  await expect(main(page).getByRole('button', { name: 'Void' })).toHaveCount(0);
});

test('Print label: 3 × 3 with the items, 2 × 3 without, the size kept for next time', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
  await open(page, '/orders/o-47');
  await fromMenu(page, 'Print label');
  const print = sheet(page, 'Print label');
  await expect(print.getByRole('radio', { name: '3 × 3 in' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(print).toContainText('#261031-0047');
  await expect(print).toContainText('COD ৳3,470');
  await expect(print).toContainText('2 items: Cotton T-shirt ×2, Eid combo ×1');
  await expect(print.getByRole('img', { name: '261031-0047' })).toBeVisible();
  await print.getByRole('radio', { name: '2 × 3 in' }).click();
  await expect(print).not.toContainText('2 items:');
  await print.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await print.getByRole('button', { name: 'Close' }).click();
  await fromMenu(page, 'Print label');
  await expect(sheet(page, 'Print label').getByRole('radio', { name: '2 × 3 in' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test("orders picked in the list print their labels together, the list's only bulk action", async ({
  page,
}) => {
  await open(page, '/orders?tab=all');
  await main(page).getByRole('button', { name: 'Select' }).click();
  await expect(main(page)).toContainText('0 selected');
  await main(page).getByRole('checkbox', { name: '#261031-0047' }).check();
  await main(page).getByRole('checkbox', { name: '#261031-0044' }).check();
  await expect(main(page)).toContainText('2 selected');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Print 2 labels' }).click();
  const print = sheet(page, 'Print label');
  await expect(print.getByRole('img', { name: /^2610/ })).toHaveCount(2);
  await expect(print.getByRole('button', { name: 'Print 2 labels' })).toBeEnabled();
  await print.getByRole('button', { name: 'Close' }).click();
  await main(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, '261031-0047')).toBeVisible();
});

test('a counter order with an IMEI is handed over with the serial of each unit', async ({
  page,
}) => {
  const log = await open(
    page,
    '/orders/o-45',
    day((orders) => {
      order(orders, 'o-45').items = [
        {
          name: ['স্মার্ট ওয়াচ', 'Smart watch'],
          quantity: 1,
          unitPrice: 650,
          serials: { inStock: [...IMEIS], sent: [] },
        },
      ];
    }),
  );
  await main(page).getByRole('button', { name: 'Hand over' }).click();
  const hand = sheet(page, 'Hand over');
  await expect(hand).toContainText(
    'Take ৳650 in cash, and pick the IMEI of each unit you hand over.',
  );
  await expect(hand.getByRole('button', { name: 'Hand over' })).toBeDisabled();
  await hand.getByRole('button', { name: IMEIS[1] }).click();
  await hand.getByRole('button', { name: 'Hand over' }).click();
  expect(sent(log, 'POST', '/orders/o-45/hand-over')).toEqual([
    { serials: [{ lineId: 'o-45-line-0', serials: [IMEIS[1]] }] },
  ]);
  await expect(page.getByText('Delivered · ৳650 Cash')).toBeVisible();
});
