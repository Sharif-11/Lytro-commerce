import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { typeCode } from './support/onboarding-api';
import {
  automatedMethods,
  drawnMethods,
  keysSavedMethods,
  nothingSetUp,
  testAccountMethods,
  unreadableMethods,
  type PaymentMethodsFixture,
} from './support/payment-methods';

// TENANT-DASHBOARD-DESIGN §7.35, Slice 5.8's part 1 (the prototype's Part 33): Settings > Payment methods, and Balance's
// on-hold line. Each test runs on a phone and on a desktop.

const PAGE = '/settings/payment-methods';

async function open(
  page: Page,
  methods: PaymentMethodsFixture | null = null,
  state: ShopState = {},
): Promise<ApiLog> {
  const log = await mockApi(page, {
    language: 'en',
    paymentMethods: methods ?? drawnMethods('en'),
    ...state,
  });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(page.getByRole('main').getByText('Where your customers send money')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');

/** A method's card, by the name in its head. */
const card = (page: Page, name: string) =>
  main(page)
    .locator('div.rounded-card')
    .filter({ has: page.getByText(name, { exact: true }) });

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

async function fillKeys(page: Page): Promise<void> {
  await sheet(page).getByLabel('App key').fill('key-1');
  await sheet(page).getByLabel('App secret').fill('secret-1');
  await sheet(page).getByLabel('Username').fill('user-1');
  await sheet(page).getByLabel('Password').fill('pass-1');
}

test('Settings holds the row, no longer under Coming later, and it opens the page', async ({
  page,
}) => {
  await mockApi(page, { language: 'en', paymentMethods: drawnMethods('en') });
  await page.goto(`/${SLUG}/settings`);
  const row = main(page).getByRole('link', { name: /^Payment methods/ });
  await expect(row).toContainText('Wallets and bank accounts');
  // After Delivery, among what's set up once, and gone from what comes later.
  const names = await main(page).getByRole('link').allInnerTexts();
  const delivery = names.findIndex((name) => name.startsWith('Delivery'));
  expect(names[delivery + 1]).toContain('Payment methods');
  await expect(
    main(page).locator('[aria-disabled="true"]', { hasText: 'Payment methods' }),
  ).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(`/${SLUG}${PAGE}`);
  await expect(main(page)).toContainText('never through Lytro');
  await expect(main(page)).toContainText('Cash on delivery needs nothing here');
  await expectAccessible(page);
});

test('a new shop starts with every method off, and turning one on warns until it has an account', async ({
  page,
}) => {
  const log = await open(page, nothingSetUp());
  await expect(main(page)).toContainText("Until then customers can't pay online");
  await expect(main(page).getByRole('switch')).toHaveCount(5);
  await expect(card(page, 'bKash')).toContainText('Off');
  await expect(card(page, 'bKash').getByRole('button', { name: 'Add account' })).toHaveCount(0);

  await main(page).getByRole('switch', { name: 'Turn bKash on or off' }).click();
  await expect(card(page, 'bKash')).toContainText('No account yet');
  await expect(card(page, 'bKash')).toContainText("Customers can't pay this way until");
  expect(sent(log, 'PUT', '/payment-methods/bkash')).toEqual([{ enabled: true, accounts: [] }]);
  // The first-time line goes once anything is on; the other methods stay as they were.
  await expect(main(page)).not.toContainText('Until then customers');
  await expect(card(page, 'Nagad')).not.toContainText('Add account');
  await expectAccessible(page);
});

test('an account is added not active, then made active by its radio', async ({ page }) => {
  const methods = nothingSetUp();
  const bkash = methods.methods[0];
  if (bkash) bkash.enabled = true;
  const log = await open(page, methods);
  await card(page, 'bKash').getByRole('button', { name: 'Add account' }).click();

  const adding = sheet(page);
  await expect(adding.getByRole('heading', { name: 'Add a bKash account' })).toBeVisible();
  const save = adding.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await adding.getByLabel('bKash number').fill('0171123');
  await adding.getByLabel('Account name').fill('Megh Fashion');
  await save.click();
  await expect(adding).toContainText("That number isn't right. Enter 11 digits starting with 01.");
  expect(sent(log, 'PUT', '/payment-methods/bkash')).toEqual([]);

  await adding.getByLabel('bKash number').fill('+8801711234567');
  await expect(adding).toContainText('Customers use Send Money.');
  await adding.getByRole('button', { name: 'Merchant' }).click();
  await expect(adding).toContainText('Customers use Payment.');
  await adding.getByRole('button', { name: 'Agent' }).click();
  await expect(adding).toContainText('Customers use Cash Out.');
  await adding.getByRole('button', { name: 'Merchant' }).click();
  await adding.getByLabel('Note for customers (optional)').fill('Reference: your order');
  await expectAccessible(page);
  await save.click();

  await expect(page.getByText('Account added. Make it active')).toBeVisible();
  expect(sent(log, 'PUT', '/payment-methods/bkash')).toEqual([
    {
      enabled: true,
      accounts: [
        {
          accountName: 'Megh Fashion',
          number: '01711234567',
          accountType: 'merchant',
          note: 'Reference: your order',
          active: false,
        },
      ],
    },
  ]);
  const radio = card(page, 'bKash').getByRole('radio', { name: 'Make 01711 234 567 active' });
  await expect(radio).not.toBeChecked();
  await expect(card(page, 'bKash')).toContainText(
    'No account is active, so customers see no number',
  );

  await radio.click();
  await expect(radio).toBeChecked();
  await expect(card(page, 'bKash')).toContainText('Active: 01711 234 567');
  const saves = sent(log, 'PUT', '/payment-methods/bkash');
  expect((saves.at(-1)?.accounts as { active: boolean }[])[0]?.active).toBe(true);
});

test('a number already saved is said under the field, and Rocket takes a twelfth digit', async ({
  page,
}) => {
  const log = await open(page);
  await card(page, 'bKash').getByRole('button', { name: 'Add account' }).click();
  await sheet(page).getByLabel('bKash number').fill('01911222333');
  await sheet(page).getByLabel('Account name').fill('Again');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toContainText('This number is already saved.');
  expect(sent(log, 'PUT', '/payment-methods/bkash')).toEqual([]);
  await sheet(page).getByRole('button', { name: 'Close' }).click();

  await main(page).getByRole('switch', { name: 'Turn Rocket on or off' }).click();
  await card(page, 'Rocket').getByRole('button', { name: 'Add account' }).click();
  await sheet(page).getByLabel('Rocket number').fill('0171123456789');
  await sheet(page).getByLabel('Account name').fill('Long');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toContainText('Enter 11 or 12 digits');
  await sheet(page).getByLabel('Rocket number').fill('019112345678');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Rocket')).toContainText('019112345678');
});

test('editing keeps the account and its place; deleting the active one says what it costs', async ({
  page,
}) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await bkash.getByRole('button', { name: 'Edit 01911 222 333' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Edit bKash account' })).toBeVisible();
  await expect(sheet(page).getByLabel('bKash number')).toHaveValue('01911 222 333');
  await sheet(page).getByLabel('Account name').fill('Rumana');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(bkash).toContainText('Rumana');
  await expect(page.getByText('Account added')).toHaveCount(0);
  const edited = sent(log, 'PUT', '/payment-methods/bkash').at(-1);
  expect(edited?.accounts).toEqual([
    expect.objectContaining({ id: 'bk-main', active: true }),
    expect.objectContaining({ id: 'bk-spare', accountName: 'Rumana', number: '01911222333' }),
  ]);

  await bkash.getByRole('button', { name: 'Edit 01711 234 567' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  const asking = page.getByRole('dialog', { name: 'Delete this account?' });
  await expect(asking).toContainText("This is bKash's active account.");
  await expect(asking).toContainText("customers can't pay by bKash until");
  await asking.getByRole('button', { name: 'Keep it' }).click();
  await expect(bkash).toContainText('01711 234 567');

  await bkash.getByRole('button', { name: 'Edit 01711 234 567' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this account?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(bkash).toContainText('No account is active');
  await expect(bkash).not.toContainText('01711 234 567');
});

test('a bank account has its own fields, and turning a method off keeps what is saved', async ({
  page,
}) => {
  const log = await open(page);
  await card(page, 'Bank transfer').getByRole('button', { name: 'Add account' }).click();
  const adding = sheet(page);
  await expect(adding.getByRole('heading', { name: 'Add a bank account' })).toBeVisible();
  const save = adding.getByRole('button', { name: 'Save' });
  await adding.getByLabel('Bank name').fill('City Bank');
  await adding.getByLabel('Account name').fill('Megh Fashion');
  await expect(save).toBeDisabled();
  await adding.getByLabel('Account number').fill('1234567890');
  await adding.getByLabel('Branch (optional)').fill('Gulshan');
  await adding.getByLabel('Instructions for customers (optional)').fill('Send a receipt');
  await save.click();
  await expect(card(page, 'Bank transfer')).toContainText('City Bank');
  expect(sent(log, 'PUT', '/payment-methods/bank')).toEqual([
    {
      enabled: true,
      accounts: [
        {
          accountName: 'Megh Fashion',
          bankName: 'City Bank',
          accountNumber: '1234567890',
          branch: 'Gulshan',
          instructions: 'Send a receipt',
          active: false,
        },
      ],
    },
  ]);

  await main(page).getByRole('switch', { name: 'Turn Nagad on or off' }).click();
  await expect(card(page, 'Nagad')).toContainText('Off · 1 account saved');
  await expect(card(page, 'Nagad')).not.toContainText('Add account');
  const off = sent(log, 'PUT', '/payment-methods/nagad');
  expect(off[0]).toMatchObject({ enabled: false, accounts: [{ id: 'ng-1', active: true }] });
});

test('only bKash asks how its money is taken, with the fees the platform sets', async ({
  page,
}) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await expect(bkash).toContainText('How you take money');
  await expect(bkash).toContainText('Fee 1.00%, free on a trial.');
  await expect(bkash).toContainText('Fee 0.10%, free on a trial.');
  await expect(bkash).toContainText('No phone is paired yet, so your staff check by hand for now.');
  await expect(card(page, 'Nagad')).not.toContainText('How you take money');
  await expect(card(page, 'Nagad')).toContainText('Your staff check each payment. No fee.');

  await bkash.getByRole('radio', { name: /^By hand/ }).click();
  await expect(bkash.getByRole('radio', { name: /^By hand/ })).toBeChecked();
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([{ way: 'manual' }]);
  await expect(bkash).not.toContainText('No phone is paired yet');
});

test('a paired phone is counted', async ({ page }) => {
  await open(page, { ...drawnMethods('en'), phones: 1 });
  await expect(card(page, 'bKash')).toContainText('1 phone paired.');
});

test('choosing automated with no keys opens the sheet; connecting never turns it on by itself', async ({
  page,
}) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await bkash.getByRole('radio', { name: /^Automated checkout/ }).click();
  const keys = sheet(page);
  await expect(keys.getByRole('heading', { name: 'Connect bKash checkout' })).toBeVisible();
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([]);
  await expect(keys).toContainText("they're never shown again");
  await expect(keys.getByLabel('The account that receives the money')).toHaveValue('bk-main');

  const go = keys.getByRole('button', { name: 'Save and test' });
  await expect(go).toBeDisabled();
  await fillKeys(page);
  await keys.getByRole('switch', { name: 'Test account' }).click();
  await expectAccessible(page);
  await go.click();

  await expect(keys).toContainText('bKash is connected.');
  expect(sent(log, 'PUT', '/payment-methods/accounts/bk-main/gateway')).toEqual([
    {
      appKey: 'key-1',
      appSecret: 'secret-1',
      username: 'user-1',
      password: 'pass-1',
      sandbox: true,
    },
  ]);
  expect(sent(log, 'POST', '/payment-methods/accounts/bk-main/gateway/test')).toHaveLength(1);
  // Not now leaves how money is taken as it was.
  await keys.getByRole('button', { name: 'Not now' }).click();
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([]);
  await expect(bkash.getByRole('radio', { name: /^Listener/ })).toBeChecked();
  await expect(bkash.getByRole('button', { name: 'Manage keys' })).toBeVisible();

  // With keys saved, choosing automated selects their account and needs no sheet.
  await bkash.getByRole('radio', { name: /^Automated checkout/ }).click();
  await expect(bkash.getByRole('radio', { name: /^Automated checkout/ })).toBeChecked();
  expect(log.calls.map((call) => call.path)).toContain(
    '/payment-methods/accounts/bk-main/automated',
  );
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([{ way: 'automated' }]);
  await expect(bkash).toContainText('its fee is on hold in your balance');
});

test('Turn it on chooses the account and the way, after connecting', async ({ page }) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await bkash.getByRole('button', { name: 'Connect' }).click();
  await fillKeys(page);
  await sheet(page).getByRole('button', { name: 'Save and test' }).click();
  await sheet(page).getByRole('button', { name: 'Turn it on' }).click();
  await expect(bkash.getByRole('radio', { name: /^Automated checkout/ })).toBeChecked();
  await expect(bkash.getByText('Automated', { exact: true })).toBeVisible();
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([{ way: 'automated' }]);
});

test("a refusal shows bKash's code and automated stays off; its limit and being out of reach say so", async ({
  page,
}) => {
  const methods = drawnMethods('en');
  methods.test = { ok: false, code: '2001' };
  const log = await open(page, methods);
  await card(page, 'bKash').getByRole('button', { name: 'Connect' }).click();
  await fillKeys(page);
  const go = sheet(page).getByRole('button', { name: 'Save and test' });
  await go.click();
  await expect(sheet(page)).toContainText('bKash refused the connection (code 2001).');
  await expect(sheet(page)).toContainText('Automated checkout stays off.');
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([]);
  // What was typed stays to correct, and the sheet stays the one it opened as.
  await expect(sheet(page).getByLabel('App key')).toHaveValue('key-1');
  await expect(sheet(page)).not.toContainText('Keys are saved.');

  methods.test = { ok: false, code: 'token_limit' };
  await go.click();
  await expect(sheet(page)).toContainText('bKash takes only two tries an hour');
  await expect(sheet(page)).not.toContainText('code token_limit');

  methods.test = { ok: false, code: 'timeout' };
  await go.click();
  await expect(sheet(page)).toContainText("Couldn't reach bKash just now.");
});

test('Manage keys says they are saved, tests them, and removes them back to the listener', async ({
  page,
}) => {
  const log = await open(page, automatedMethods('en'));
  const bkash = card(page, 'bKash');
  await expect(bkash.getByRole('radio', { name: /^Automated checkout/ })).toBeChecked();
  await bkash.getByRole('button', { name: 'Manage keys' }).click();
  const keys = sheet(page);
  await expect(keys).toContainText('Keys are saved. To change them, enter all four again.');
  // Never shown again: the fields are empty, and Save waits for all four.
  await expect(keys.getByLabel('App key')).toHaveValue('');
  await expect(keys.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  await keys.getByRole('button', { name: 'Test connection' }).click();
  await expect(keys).toContainText('bKash is connected.');
  expect(sent(log, 'PUT', '/payment-methods/accounts/bk-main/gateway')).toEqual([]);

  await keys.getByRole('button', { name: 'Remove keys' }).click();
  const asking = page.getByRole('dialog', { name: 'Remove the keys?' });
  await expect(asking).toContainText("bKash's payments go back to the listener");
  await asking.getByRole('button', { name: 'Remove keys' }).click();
  await expect(bkash.getByRole('radio', { name: /^Listener/ })).toBeChecked();
  await expect(bkash.getByRole('button', { name: 'Connect' })).toBeVisible();
  // The listener first: a wallet is never left choosing automated with nothing to run it on.
  const order = log.calls
    .filter((call) => call.method === 'PUT' || call.method === 'DELETE')
    .map((call) => `${call.method} ${call.path}`);
  expect(order).toEqual([
    'PUT /payment-methods/bkash/way',
    'DELETE /payment-methods/accounts/bk-main/gateway',
  ]);
});

test('keys entered again on a wallet already automated close the sheet with nothing more to ask', async ({
  page,
}) => {
  const log = await open(page, automatedMethods('en'));
  await card(page, 'bKash').getByRole('button', { name: 'Manage keys' }).click();
  await fillKeys(page);
  await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(sent(log, 'PUT', '/payment-methods/bkash/way')).toEqual([]);
});

test('keys saved but not turned on open as saved, and a test account is marked', async ({
  page,
}) => {
  await open(page, keysSavedMethods('en'));
  await expect(card(page, 'bKash').getByRole('radio', { name: /^Listener/ })).toBeChecked();
  await card(page, 'bKash').getByRole('button', { name: 'Manage keys' }).click();
  await expect(sheet(page)).toContainText('Keys are saved.');
  await sheet(page).getByRole('button', { name: 'Close' }).click();
});

test('the Test chip shows only on a test account', async ({ page }) => {
  await open(page, testAccountMethods('en'));
  await expect(card(page, 'bKash').getByText('Test', { exact: true })).toBeVisible();
  await expect(card(page, 'Nagad').getByText('Test', { exact: true })).toHaveCount(0);
});

test('keys that can no longer be read say so, and Enter again opens the sheet', async ({
  page,
}) => {
  await open(page, unreadableMethods('en'));
  await expect(card(page, 'bKash')).toContainText("bKash's keys can no longer be read");
  await card(page, 'bKash').getByRole('button', { name: 'Enter again' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Connect bKash checkout' })).toBeVisible();
  await expect(sheet(page).getByLabel('The account that receives the money')).toHaveValue(
    'bk-main',
  );
});

test('an owner with no verified phone is told, and verifies it there', async ({ page }) => {
  const methods = drawnMethods('en');
  methods.ownerPhoneVerified = false;
  const log = await open(page, methods);
  await expect(main(page)).toContainText("Your phone number isn't verified");
  await main(page).getByRole('button', { name: 'Verify', exact: true }).click();

  await expect(
    sheet(page).getByRole('heading', { name: 'Verify your phone number' }),
  ).toBeVisible();
  await expect(sheet(page)).toContainText('The code costs you nothing.');
  await sheet(page).getByLabel('Phone number').fill('12');
  await sheet(page).getByRole('button', { name: 'Send code' }).click();
  await expect(sheet(page)).toContainText('Enter a valid Bangladeshi mobile number');
  await sheet(page).getByLabel('Phone number').fill('1711234567');
  await sheet(page).getByRole('button', { name: 'Send code' }).click();
  await expect(sheet(page)).toContainText('+880 1711 234 567');
  expect(sent(log, 'POST', '/me/identities/code')).toEqual([
    { kind: 'phone', value: '+8801711234567' },
  ]);
  await typeCode(page, '123456');
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Verify' }).click();

  await expect(main(page)).not.toContainText("Your phone number isn't verified");
  expect(sent(log, 'POST', '/me/identities/verify')).toEqual([
    { kind: 'phone', value: '+8801711234567', code: '123456' },
  ]);
});

test('a number on another account is refused only after its code, offering another', async ({
  page,
}) => {
  const methods = drawnMethods('en');
  methods.ownerPhoneVerified = false;
  await open(page, methods);
  await main(page).getByRole('button', { name: 'Verify', exact: true }).click();
  await sheet(page).getByLabel('Phone number').fill('1711234567');
  await sheet(page).getByRole('button', { name: 'Send code' }).click();
  await typeCode(page, '409409');
  await sheet(page).getByRole('button', { name: 'Verify' }).click();
  await expect(sheet(page)).toContainText('This number already has a Lytro account.');
  await sheet(page).getByRole('button', { name: 'Use another number' }).click();
  await expect(sheet(page).getByLabel('Phone number')).toHaveValue('');
});

test('staff who can view read everything with no controls, and only the line about a phone', async ({
  page,
}) => {
  const methods = drawnMethods('en');
  methods.ownerPhoneVerified = false;
  const log = await open(page, methods, { isOwner: false, permissions: ['wallets:read'] });
  await expect(main(page)).toContainText('Only the shop owner can change these.');
  await expect(main(page)).toContainText('01711 234 567');
  await expect(main(page)).toContainText('Money is taken by: Listener');
  await expect(main(page).getByRole('switch')).toHaveCount(0);
  await expect(main(page).getByRole('radio')).toHaveCount(0);
  await expect(main(page).getByRole('button')).toHaveCount(0);
  await expect(main(page)).toContainText("Your phone number isn't verified");
  // Neither the rates nor the phones are theirs to read here.
  const read = log.calls.map((call) => call.path);
  expect(read).not.toContain('/balance/current-rates');
  expect(read).not.toContain('/listener/devices');
  await expectAccessible(page);
});

test('Settings shows such staff only this row', async ({ page }) => {
  await mockApi(page, {
    language: 'en',
    isOwner: false,
    permissions: ['wallets:read'],
    paymentMethods: drawnMethods('en'),
  });
  await page.goto(`/${SLUG}/settings`);
  await expect(main(page).getByRole('link', { name: /^Payment methods/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^Shop details/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^Delivery/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^Tax/ })).toHaveCount(0);
});

test('Balance says what is on hold and what can be spent, only while something is', async ({
  page,
}) => {
  await mockApi(page, { language: 'en', money: { balance: '412.50', held: '12.50' } });
  await page.goto(`/${SLUG}/balance`);
  await expect(main(page).getByText('On hold', { exact: true })).toBeVisible();
  await expect(main(page)).toContainText('You can spend the other ৳400.');
  await expect(main(page)).toContainText('released by themselves');
});

test('Balance with nothing held has no such line', async ({ page }) => {
  await mockApi(page, { language: 'en', money: { balance: '412.50' } });
  await page.goto(`/${SLUG}/balance`);
  await expect(main(page).getByText('Top up', { exact: true })).toBeVisible();
  await expect(main(page).getByText('On hold', { exact: true })).toHaveCount(0);
});
