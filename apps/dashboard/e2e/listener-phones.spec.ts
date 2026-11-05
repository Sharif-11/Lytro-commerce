import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnMethods } from './support/payment-methods';
import {
  drawnShopPayments,
  OLD_PHONE,
  phone,
  RUMANA,
  SHOP_PHONE,
  type ShopPaymentsFixture,
} from './support/shop-payments';

// TENANT-DASHBOARD-DESIGN §7.37, Slice 5.8's part 4 (the prototype's Part 35): Settings' Listener phones, pairing with a QR and a
// code, and the ways in from Payment methods and Home's checklist. Each test runs on a phone and on a desktop.

const PAGE = '/settings/listener';
const APP_PAGE = 'https://lytro.app/listener';

async function open(
  page: Page,
  fixture: ShopPaymentsFixture = drawnShopPayments(),
  state: ShopState = {},
): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', shopPayments: fixture, ...state });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(page.getByRole('main').getByText('Run the Lytro Listener app')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');

function sent(log: ApiLog, method: string, path: string): unknown[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body);
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

test('Settings holds the row, no longer under Coming later', async ({ page }) => {
  await mockApi(page, { language: 'en', shopPayments: drawnShopPayments() });
  await page.goto(`/${SLUG}/settings`);
  const row = main(page).getByRole('link', { name: /Listener phones/ });
  await expect(row).toContainText('Matches payment SMS');
  await expect(main(page).locator('[aria-disabled="true"]', { hasText: 'Listener' })).toHaveCount(
    0,
  );
  await row.click();
  await expect(page).toHaveURL(`/${SLUG}${PAGE}`);
});

test('whoever may only read phones finds the row alone among those Settings gives them', async ({
  page,
}) => {
  await mockApi(page, {
    language: 'en',
    shopPayments: drawnShopPayments(),
    isOwner: false,
    permissions: ['listener:read'],
  });
  await page.goto(`/${SLUG}/settings`);
  await expect(main(page).getByRole('link', { name: /Listener phones/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Payment methods/ })).toHaveCount(0);
});

test('the phones: how each is doing, against the plan, and those cancelled', async ({ page }) => {
  await open(page);
  await expect(main(page)).toContainText('2 of 5 phones paired');
  const rumana = main(page).getByRole('button', { name: /Rumana's phone/ });
  await expect(rumana).toContainText('Xiaomi Redmi Note 12');
  await expect(rumana).toContainText('Seen 4 min ago');
  await expect(rumana).toContainText('12 receipts today');
  await expect(rumana).toContainText('Online');
  const shop = main(page).getByRole('button', { name: /Shop phone/ });
  await expect(shop).toContainText('Seen 2 hours ago');
  await expect(shop).toContainText('0 receipts today');
  await expect(shop).toContainText('Offline');
  await expect(main(page)).toContainText('Cancelled phones');
  await expect(main(page)).toContainText('Old phone');
  await expect(main(page)).toContainText('Cancelled from the shop');
  await expect(main(page).getByRole('link', { name: /Download the app/ })).toHaveAttribute(
    'href',
    APP_PAGE,
  );
  await expectAccessible(page);
});

test("a phone that hasn't reported yet hasn't been seen", async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = [phone({ id: 'phone-9', name: 'New phone', lastSeenAt: null, online: false })];
  await open(page, fixture);
  const row = main(page).getByRole('button', { name: /New phone/ });
  await expect(row).toContainText('Not seen yet');
  await expect(row).toContainText('Offline');
  await expect(row).not.toContainText('Seen ');
  await row.click();
  await expect(sheet(page)).toContainText('Not seen yet');
});

test('every way a phone can be cancelled has its own words', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = (
    [
      ['device', 'Unpaired from the phone'],
      ['operator', 'Stopped by Lytro'],
      ['flags', 'Cancelled by itself after another phone tried to use it'],
      ['installation_blocked', 'Lytro blocked the app on this phone'],
    ] as const
  ).map(([reason], at) => ({
    ...OLD_PHONE,
    id: `gone-${String(at)}`,
    name: `Gone ${String(at)}`,
    revokeReason: reason,
  }));
  await open(page, fixture);
  await expect(main(page)).toContainText('Unpaired from the phone');
  await expect(main(page)).toContainText('Stopped by Lytro');
  await expect(main(page)).toContainText('Cancelled by itself after another phone tried to use it');
  await expect(main(page)).toContainText('Lytro blocked the app on this phone');
});

test('none yet says how to set it up, with the guide', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = [];
  await open(page, fixture);
  await expect(main(page)).toContainText('How to set it up');
  await expect(main(page)).toContainText("Install the app on the phone with the shop's bKash SIM");
  await expect(main(page).getByRole('link', { name: /Download the app/ })).toHaveAttribute(
    'href',
    APP_PAGE,
  );
  await expect(main(page)).not.toContainText('phones paired');
  await expect(main(page).getByRole('button', { name: 'Pair a phone' })).toBeVisible();
  await expectAccessible(page);
});

test('a plan with no limit just says how many', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.limit = null;
  fixture.phones = [RUMANA];
  await open(page, fixture);
  await expect(main(page)).toContainText('1 phone paired.');
  await expect(main(page).getByRole('button', { name: 'Pair a phone' })).toBeVisible();
});

test('the plan full: no Pair, and the way out', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.limit = 1;
  fixture.phones = [RUMANA];
  await open(page, fixture);
  await expect(main(page)).toContainText("All your plan's phones are paired.");
  await expect(main(page).getByRole('button', { name: 'Pair a phone' })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan`,
  );
});

test('a cancelled phone frees its place', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.limit = 1;
  fixture.phones = [RUMANA, OLD_PHONE];
  await open(page, fixture);
  await expect(main(page)).toContainText('1 of 1 phones paired');
  await main(page)
    .getByRole('button', { name: /Rumana's phone/ })
    .click();
  await sheet(page).getByRole('button', { name: 'Cancel this phone' }).click();
  await sheet(page).getByRole('button', { name: 'Cancel this phone' }).click();
  await expect(main(page).getByRole('button', { name: 'Pair a phone' })).toBeVisible();
});

test('another phone trying its access is told plainly', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = [phone({ id: 'phone-1', flags: 1 })];
  await open(page, fixture);
  await expect(main(page)).toContainText("Another phone tried to use this phone's access.");
});

test('whoever may only look can open a phone, and change nothing', async ({ page }) => {
  await open(page, drawnShopPayments(), { isOwner: false, permissions: ['listener:read'] });
  await expect(main(page)).toContainText(
    'The owner, or staff allowed to, can pair or cancel phones.',
  );
  await expect(main(page).getByRole('button', { name: 'Pair a phone' })).toHaveCount(0);
  await main(page)
    .getByRole('button', { name: /Rumana's phone/ })
    .click();
  await expect(sheet(page)).toContainText('Xiaomi Redmi Note 12');
  await expect(sheet(page).getByLabel('Phone name')).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Cancel this phone' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toHaveCount(0);
});

test('a phone: what it is, renaming it', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Rumana's phone/ })
    .click();
  const detail = sheet(page);
  await expect(detail).toContainText('Xiaomi Redmi Note 12');
  await expect(detail).toContainText('1.0.0');
  await expect(detail).toContainText('4 min ago');
  await expect(detail).toContainText('Receipts today');
  await expectAccessible(page);
  await detail.getByLabel('Phone name').fill('   ');
  await expect(detail.getByRole('button', { name: 'Save' })).toBeDisabled();
  await detail.getByLabel('Phone name').fill('Counter phone');
  await detail.getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByRole('button', { name: /Counter phone/ })).toBeVisible();
  expect(sent(log, 'PATCH', '/listener/devices/phone-1')).toEqual([{ name: 'Counter phone' }]);
});

test('saving an unchanged name asks the server nothing', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Rumana's phone/ })
    .click();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(sent(log, 'PATCH', '/listener/devices/phone-1')).toEqual([]);
});

test('cancelling asks first, then the phone moves down', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Rumana's phone/ })
    .click();
  await sheet(page).getByRole('button', { name: 'Cancel this phone' }).click();
  const asking = page.getByRole('dialog', { name: 'Cancel this phone?' });
  await expect(asking).toContainText(
    "Rumana's phone stops sending SMS straight away. Using it again means pairing it again.",
  );
  expect(sent(log, 'POST', '/listener/devices/phone-1/revoke')).toEqual([]);
  await expectAccessible(page);

  await asking.getByRole('button', { name: 'Keep it' }).click();
  await expect(sheet(page).getByLabel('Phone name')).toBeVisible();
  expect(sent(log, 'POST', '/listener/devices/phone-1/revoke')).toEqual([]);

  await sheet(page).getByRole('button', { name: 'Cancel this phone' }).click();
  await page
    .getByRole('dialog', { name: 'Cancel this phone?' })
    .getByRole('button', { name: 'Cancel this phone' })
    .click();
  await expect(page.getByText("Rumana's phone cancelled.")).toBeVisible();
  expect(sent(log, 'POST', '/listener/devices/phone-1/revoke')).toHaveLength(1);
  await expect(main(page).getByRole('button', { name: /Rumana's phone/ })).toHaveCount(0);
  await expect(main(page)).toContainText('1 of 5 phones paired');
});

test('Pair: a code as a QR and as text, and it holds the app’s link', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  const pairing = sheet(page);
  await expect(pairing).toContainText('K7MP 4X2H');
  expect(sent(log, 'POST', '/listener/pairing-codes')).toHaveLength(1);
  await expect(pairing).toContainText(/This code is open for (9:\d\d|10:00) more/);
  await expect(pairing).toContainText('Waiting for the phone…');
  await expect(pairing).toContainText('Scan this QR, or type the code');
  await expect(pairing.getByRole('link', { name: /No app yet/ })).toHaveAttribute('href', APP_PAGE);

  // The squares drawn are the link's own, not a picture of something else.
  const link = 'lytro-listener://pair?code=K7MP4X2H';
  const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' });
  let squares = 0;
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) if (modules.get(y, x)) squares += 1;
  }
  const drawn = await pairing
    .getByRole('img', { name: 'QR code to pair a phone' })
    .locator('path')
    .getAttribute('d');
  expect((drawn ?? '').match(/M/g)).toHaveLength(squares);

  // A laptop can't open the app, so only a phone is offered it.
  const inApp = pairing.locator(`a[href="${link}"]`);
  await expect(inApp).toHaveText('Pairing this phone? Open in the app');
  const onPhone = (page.viewportSize()?.width ?? 0) < 1024;
  if (onPhone) await expect(inApp).toBeVisible();
  else await expect(inApp).toBeHidden();
  await expectAccessible(page);
});

test('the code is made once for one opening', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  await expect(sheet(page)).toContainText('K7MP 4X2H');
  await page.waitForTimeout(1200);
  expect(sent(log, 'POST', '/listener/pairing-codes')).toHaveLength(1);
});

test('the phone arriving shows here by itself, and Home hears of it', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.limit = 3;
  fixture.arrives = phone({ id: 'phone-9', name: 'Redmi Note 12', model: 'Redmi Note 12' });
  const log = await open(page, fixture);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  await expect(sheet(page)).toContainText('K7MP 4X2H');
  const homeBefore = log.calls.filter((call) => call.path === '/home').length;
  const paired = sheet(page);
  await expect(paired.getByRole('heading', { name: 'Phone paired' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(paired).toContainText(
    "Redmi Note 12 now reads this shop's payment SMS. Finish the steps on the phone.",
  );
  await expect
    .poll(() => log.calls.filter((call) => call.path === '/home').length)
    .toBeGreaterThan(homeBefore);
  await paired.getByRole('button', { name: 'Done' }).click();
  await expect(main(page)).toContainText('3 of 3 phones paired');
});

test('a code runs out, and a new one can be asked for', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.codeLifeMs = 1500;
  const log = await open(page, fixture);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  const pairing = sheet(page);
  await expect(pairing).toContainText('K7MP 4X2H');
  await expect(pairing).toContainText('This code has expired. Get a new one.', { timeout: 5000 });
  await expect(pairing).not.toContainText('Waiting for the phone');
  await expect(pairing.getByRole('link', { name: /Open in the app/ })).toHaveCount(0);
  expect(sent(log, 'POST', '/listener/pairing-codes')).toHaveLength(1);
  fixture.codeLifeMs = 600_000;
  await pairing.getByRole('button', { name: 'New code' }).click();
  await expect(pairing).toContainText('N3WC 0D2E');
  await expect(pairing).toContainText('Waiting for the phone…');
  expect(sent(log, 'POST', '/listener/pairing-codes')).toHaveLength(2);
});

test("a shop that can't pair is told why", async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.pairingRefused = {
    status: 403,
    code: 'tenant_offline',
    message: "The shop's subscription isn't active, so a phone can't be paired now.",
  };
  await open(page, fixture);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  await expect(sheet(page)).toContainText(
    "The shop's subscription isn't active, so a phone can't be paired now.",
  );
  await expect(sheet(page)).not.toContainText('Waiting for the phone');
});

test('Payment methods goes to the phones', async ({ page }) => {
  await mockApi(page, {
    language: 'en',
    shopPayments: drawnShopPayments(),
    paymentMethods: drawnMethods('en'),
  });
  await page.goto(`/${SLUG}/settings/payment-methods`);
  await expect(main(page).getByRole('link', { name: 'Pair a phone' })).toHaveAttribute(
    'href',
    `/${SLUG}${PAGE}`,
  );
});

test('the checklist: the listener item opens the page, and ticks once a phone is paired', async ({
  page,
}) => {
  await mockApi(page, { language: 'en', shopPayments: drawnShopPayments(), ...DAY_ONE });
  await page.goto(`/${SLUG}`);
  const item = main(page).getByRole('link', { name: 'Pair a listener phone' });
  await expect(item).toHaveAttribute('href', `/${SLUG}${PAGE}`);
  await expect(main(page).getByText('Phase 5')).toHaveCount(0);
});

test('reads in Bangla, with no key showing', async ({ page }) => {
  await mockApi(page, { language: 'bn', shopPayments: drawnShopPayments() });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(main(page)).toContainText('5টির মধ্যে 2টি ফোন পেয়ার করা আছে');
  await expect(main(page)).toContainText('অনলাইন');
  await expect(main(page)).toContainText('অফলাইন');
  await expect(main(page)).toContainText('4 মিনিট আগে দেখা গেছে');
  await expect(main(page)).toContainText('ক্যানসেল করা ফোন');
  await main(page).getByRole('button', { name: 'ফোন পেয়ার করুন' }).click();
  await expect(sheet(page)).toContainText('ফোনের অপেক্ষায়…');
  expect(await page.locator('body').innerText()).not.toMatch(/\b(sp|lp)[A-Z][A-Za-z]+\b/);
});

test('fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await main(page).getByRole('button', { name: 'Pair a phone' }).click();
  await expect(sheet(page)).toContainText('K7MP 4X2H');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('uses the fixtures it is given', () => {
  expect(SHOP_PHONE.online).toBe(false);
  expect(OLD_PHONE.status).toBe('revoked');
});
