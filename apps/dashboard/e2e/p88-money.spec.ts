import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { STARTER } from './support/catalogue';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnMethods, type PaymentMethodsFixture } from './support/payment-methods';
import { CHECKING_TOP_UP, drawnPayments, payment } from './support/payments';
import { SHOT_UPLOAD_PATH } from './support/p88-money-mock';

// TENANT-DASHBOARD-DESIGN §7.41 (Slice 8.8, Part 39), the money side: a payment method Lytro is retiring marked on its card
// (WAL-18, D8-65, D8-78), and a screenshot for a payment Lytro is checking, sent from Billing (ADM-17, D8-15). Each test
// runs on a phone and on a desktop (playwright.config.ts).

const main = (page: Page) => page.getByRole('main');

const settled = drawnPayments().slice(1);
const JPEG = { name: 'bkash-payment.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(1024) };

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function posted(log: ApiLog, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === 'POST' && call.path === path)
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

// ---------- a payment method being retired

function withNagad(change: (row: PaymentMethodsFixture['methods'][number]) => void) {
  const methods = drawnMethods('en');
  const nagad = methods.methods.find((each) => each.method === 'nagad');
  if (nagad) change(nagad);
  return methods;
}

/** A method's card, by the name in its head. */
const card = (page: Page, name: string) =>
  main(page)
    .locator('div.rounded-card')
    .filter({ has: page.getByText(name, { exact: true }) });

test('marks a method Lytro is retiring, with the notice’s words, and keeps it working', async ({
  page,
}) => {
  await open(page, '/settings/payment-methods', {
    paymentMethods: withNagad((row) => {
      row.retiring = true;
    }),
  });
  const nagad = card(page, 'Nagad');
  await expect(nagad.getByText('Being retired')).toBeVisible();
  await expect(
    nagad.getByText(
      'Lytro is retiring Nagad. It keeps working for now, checkout included. When it is removed, its accounts go with it, so keep another payment method on for your customers.',
    ),
  ).toBeVisible();
  // It still works for this shop: its switch and its accounts as before.
  await expect(nagad.getByRole('switch')).toBeChecked();
  await expect(nagad.getByRole('button', { name: /^Edit / })).toBeVisible();
  await expect(card(page, 'bKash').getByText('Being retired')).toHaveCount(0);
  await expectAccessible(page);
});

test('switched off, a retiring method says it can come back on until it is removed', async ({
  page,
}) => {
  await open(page, '/settings/payment-methods', {
    paymentMethods: withNagad((row) => {
      row.retiring = true;
      row.enabled = false;
    }),
  });
  const nagad = card(page, 'Nagad');
  await expect(
    nagad.getByText(
      'Lytro is retiring Nagad. You set it up, so you can switch it back on until it is removed, and your saved number stays until then.',
    ),
  ).toBeVisible();
  await expect(nagad.getByRole('switch')).not.toBeChecked();
});

test('staff who may read see the mark without the switch', async ({ page }) => {
  await open(page, '/settings/payment-methods', {
    paymentMethods: withNagad((row) => {
      row.retiring = true;
    }),
    isOwner: false,
    permissions: ['wallets:read'],
  });
  const nagad = card(page, 'Nagad');
  await expect(nagad.getByText('Being retired')).toBeVisible();
  await expect(nagad.getByText(/^Lytro is retiring Nagad\./)).toBeVisible();
  await expect(nagad.getByRole('switch')).toHaveCount(0);
});

// ---------- a payment's screenshot

const CHECKING_RENEWAL = payment({
  ...CHECKING_TOP_UP,
  id: 'pay_renew_checking',
  kind: 'renewal',
  planId: STARTER,
  planName: 'Starter',
  amount: '449.00',
});

const shotCard = (page: Page) =>
  main(page)
    .locator('div.rounded-card')
    .filter({ has: page.getByRole('heading', { name: 'Screenshot of the payment' }) });

const picker = (page: Page) => main(page).locator('input[type="file"]');

test('sends a screenshot for a top-up being checked: the link, the file, then the payment', async ({
  page,
}) => {
  const log = await open(page, `/billing/${CHECKING_TOP_UP.id}`);
  const shot = shotCard(page);
  await expect(
    shot.getByText('Optional. It helps Lytro check faster, and only Lytro sees it.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(shot.getByRole('button', { name: 'Add a screenshot' })).toBeVisible();
  const upload = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith(SHOT_UPLOAD_PATH),
  );
  await picker(page).setInputFiles(JPEG);
  await upload;
  await expect(page.getByText('Screenshot sent to Lytro', { exact: true })).toBeVisible();
  expect(posted(log, '/balance/top-up/evidence')).toEqual([
    { contentType: 'image/jpeg', bytes: 1024 },
  ]);
  const [attached] = posted(log, `/balance/top-up/${CHECKING_TOP_UP.id}/evidence`);
  expect(attached?.['evidenceKey']).toMatch(/^evidence\//);
  // Sent: the file, Sent, when; once sent it stays, so nothing offers another.
  await expect(shot.getByText('bkash-payment.jpg')).toBeVisible();
  await expect(shot.getByText('Sent', { exact: true })).toBeVisible();
  await expect(
    shot.getByText(/^Sent to Lytro today at .+\. One screenshot a payment; once sent it stays\.$/),
  ).toBeVisible();
  await expect(shot.getByRole('button', { name: 'Add a screenshot' })).toHaveCount(0);
  await expect(picker(page)).toHaveCount(0);
  // History says so, after the payment it followed.
  await expect(main(page).getByText('You sent a screenshot')).toBeVisible();
  await expectAccessible(page);
});

test("a plan's payment goes by Billing's own routes", async ({ page }) => {
  const log = await open(page, `/billing/${CHECKING_RENEWAL.id}`, {
    money: { payments: [CHECKING_RENEWAL, ...settled] },
  });
  await picker(page).setInputFiles(JPEG);
  await expect(page.getByText('Screenshot sent to Lytro', { exact: true })).toBeVisible();
  expect(posted(log, '/billing/payment-evidence')).toHaveLength(1);
  expect(posted(log, `/billing/payments/${CHECKING_RENEWAL.id}/evidence`)).toHaveLength(1);
  expect(posted(log, '/balance/top-up/evidence')).toHaveLength(0);
});

test('refuses a file over 5 MB or of another kind before it uploads, saying which', async ({
  page,
}) => {
  const log = await open(page, `/billing/${CHECKING_TOP_UP.id}`);
  const shot = shotCard(page);
  await picker(page).setInputFiles({
    name: 'big.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(8_178_893),
  });
  await expect(
    shot.getByText('This file is over 5 MB (7.8 MB). Choose a smaller screenshot.'),
  ).toBeVisible();
  await picker(page).setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a picture'),
  });
  await expect(shot.getByText('Only a picture (JPG, PNG, WebP) or a PDF.')).toBeVisible();
  await expect(shot.getByRole('button', { name: 'Choose another' })).toBeVisible();
  expect(posted(log, '/balance/top-up/evidence')).toHaveLength(0);
});

test("an upload that doesn't finish offers Try again, which sends the same file", async ({
  page,
}) => {
  const log = await open(page, `/billing/${CHECKING_TOP_UP.id}`);
  await page.route(`**${SHOT_UPLOAD_PATH}`, (route) => route.abort());
  const shot = shotCard(page);
  await picker(page).setInputFiles(JPEG);
  await expect(
    shot.getByText("The upload didn't finish. Check the connection and try again."),
  ).toBeVisible();
  await expect(shot.getByText('bkash-payment.jpg')).toBeVisible();
  expect(posted(log, `/balance/top-up/${CHECKING_TOP_UP.id}/evidence`)).toHaveLength(0);
  await page.unroute(`**${SHOT_UPLOAD_PATH}`);
  await shot.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Screenshot sent to Lytro', { exact: true })).toBeVisible();
  expect(posted(log, `/balance/top-up/${CHECKING_TOP_UP.id}/evidence`)).toHaveLength(1);
});

test('a screenshot already sent shows as Sent on opening, with no way to send another', async ({
  page,
}) => {
  const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await open(page, `/billing/${CHECKING_TOP_UP.id}`, {
    money: {
      payments: [
        {
          ...CHECKING_TOP_UP,
          evidenceSentAt: sentAt,
          evidenceType: 'image/jpeg',
          evidenceBytes: 1_258_291,
        },
        ...settled,
      ],
    },
  });
  const shot = shotCard(page);
  // The owner, 2026-11-11: its type and size, which the server keeps; its name isn't kept.
  await expect(shot.getByText('Screenshot · JPG', { exact: true })).toBeVisible();
  await expect(shot.getByText('1.2 MB', { exact: true })).toBeVisible();
  await expect(shot.getByText(/^Sent to Lytro on \d+ \w+ at /)).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});

test('staff who may only read see no way to send one', async ({ page }) => {
  await open(page, `/billing/${CHECKING_TOP_UP.id}`, {
    isOwner: false,
    permissions: ['payments:read', 'balance:read'],
  });
  await expect(main(page).getByText('What happened')).toBeVisible();
  await expect(shotCard(page)).toHaveCount(0);
});

test("Balance's and Plan's being-checked banners lead to the payment to add one", async ({
  page,
}) => {
  await open(page, '/balance');
  await main(page).getByRole('link', { name: 'Add a screenshot' }).click();
  await expect(page).toHaveURL(new RegExp(`/billing/${CHECKING_TOP_UP.id}$`));
  await expect(shotCard(page)).toBeVisible();

  await open(page, '/plan', { money: { payments: [CHECKING_RENEWAL, ...settled] } });
  await expect(main(page).getByRole('link', { name: 'Add a screenshot' })).toHaveAttribute(
    'href',
    new RegExp(`/billing/${CHECKING_RENEWAL.id}$`),
  );
});

test('the banners offer nothing once a screenshot was sent', async ({ page }) => {
  await open(page, '/balance', {
    money: {
      payments: [{ ...CHECKING_TOP_UP, evidenceSentAt: new Date().toISOString() }, ...settled],
    },
  });
  await expect(main(page).getByText(/top-up is being checked/)).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Add a screenshot' })).toHaveCount(0);
});
