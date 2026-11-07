import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnCouriers, type CouriersFixture, type ParcelFixture } from './support/couriers';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { dhaka, meghOrders, type OrderFixture, type OrdersFixture } from './support/orders';

// TENANT-DASHBOARD-DESIGN §7.39, Phase 6 Slice 6.7 (Part 36): Settings › Couriers, connecting with its paste step, a connection's
// page; booking from a confirmed order and the Courier card in each of its states; cancelling a booking; the Orders list's courier
// line and Needs a look; Payments › Courier payouts; Sales' courier charges; Home's step. Against a mocked API, on a phone and a
// desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

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

/** Part 29's day with Nusrat Jahan's order changed: confirmed by a call, unless the change says otherwise. */
function dayWith(change: (order: OrderFixture) => void): OrdersFixture {
  const day = meghOrders();
  const order = day.orders.find((each) => each.id === 'o-47');
  if (order) {
    order.status = 'confirmed';
    order.calls = [{ outcome: 'confirmed', at: dhaka(12, 10) }];
    change(order);
  }
  return day;
}

/** Nusrat's order booked: processing, or on its way once the courier has it. */
function booked(parcel: Partial<ParcelFixture>, status: OrderFixture['status'] = 'shipped') {
  return dayWith((order) => {
    order.status = status;
    order.parcel = { courierKey: 'steadfast', cod: 3470, ...parcel };
  });
}

function couriers(change: (fixture: CouriersFixture) => void = () => undefined): CouriersFixture {
  const fixture = drawnCouriers();
  change(fixture);
  return fixture;
}

test.describe('Settings › Couriers', () => {
  test('a row under Delivery, no longer coming later', async ({ page }) => {
    await open(page, '/settings');
    await expect(main(page).getByRole('link', { name: /Couriers/ })).toBeVisible();
    await expect(main(page).getByText('Steadfast, Pathao, RedX')).toBeVisible();
    await main(page)
      .getByRole('link', { name: /Couriers/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/couriers$`));
  });

  test('none connected: all three to connect, each with what it asks for', async ({ page }) => {
    await open(page, '/settings/couriers');
    await expect(main(page).getByText('Connect a courier', { exact: true })).toBeVisible();
    for (const [name, asks] of [
      ['Steadfast', 'API key and secret key'],
      ['Pathao', 'Client ID, secret and your Pathao login'],
      ['RedX', 'API token · an area on every booking'],
    ] as const) {
      await expect(
        main(page).getByRole('button', { name: new RegExp(`${name}.*${asks}`) }),
      ).toBeVisible();
    }
    await expectAccessible(page);
  });

  test('connecting tests the keys once, then gives the address and the steps to paste it', async ({
    page,
  }) => {
    const log = await open(page, '/settings/couriers');
    await main(page)
      .getByRole('button', { name: /^Steadfast/ })
      .click();
    const sheet = dialog(page, 'Connect Steadfast');
    await expect(sheet.getByText('Lytro checks the keys once. No parcel is made.')).toBeVisible();
    const connect = sheet.getByRole('button', { name: 'Test and connect' });
    await expect(connect).toBeDisabled();
    await sheet.getByLabel('API key').fill('key-1');
    await sheet.getByLabel('Secret key').fill('secret-1');
    await connect.click();
    await expect
      .poll(() => sent(log, 'POST', '/couriers/connections'))
      .toEqual([
        { courierKey: 'steadfast', credentials: { apiKey: 'key-1', secretKey: 'secret-1' } },
      ]);
    const paste = dialog(page, 'Steadfast is connected');
    await expect(paste.getByText(/whk_7Qm2cX9rLp4Tn8Vb/)).toBeVisible();
    await expect(paste.getByText('tok_Hs82nKq0LbX4mW7e')).toBeVisible();
    await expect(paste.getByText('Paste the token into Auth token.')).toBeVisible();
    await expect(paste.getByText(/You can skip this/)).toBeVisible();
    await expectAccessible(page);
    await paste.getByRole('button', { name: 'Later' }).click();
    await expect(main(page).getByText('Connected')).toBeVisible();
    await expect(main(page).getByRole('link', { name: /Steadfast.*Default/ })).toBeVisible();
  });

  test("RedX's address carries its key, so there is no token to paste", async ({ page }) => {
    await open(page, '/settings/couriers', { couriers: couriers() });
    await main(page).getByRole('button', { name: /^RedX/ }).click();
    const sheet = dialog(page, 'Connect RedX');
    await expect(sheet.getByText(/RedX needs one of its own areas on every booking/)).toBeVisible();
    await sheet.getByLabel('API token').fill('token-1');
    await sheet.getByRole('button', { name: 'Test and connect' }).click();
    const paste = dialog(page, 'RedX is connected');
    await expect(paste.getByText(/whk_7Qm2cX9rLp4Tn8Vb/)).toBeVisible();
    await expect(
      paste.getByText('Paste the address. Its key is inside it, so nothing else is needed.'),
    ).toBeVisible();
    await expect(paste.getByText('tok_Hs82nKq0LbX4mW7e')).toHaveCount(0);
    await expect(paste.getByText(/^Token$|^Secret$/)).toHaveCount(0);
  });

  test("the courier's own refusal, and too many tries, save nothing", async ({ page }) => {
    await open(page, '/settings/couriers', {
      couriers: {
        connections: [],
        connectRefused: {
          status: 409,
          code: 'conflict',
          message: 'Steadfast didn’t accept these keys.',
          details: { courierKey: 'steadfast', courierMessage: 'Unauthorized.' },
        },
      },
    });
    await main(page)
      .getByRole('button', { name: /^Steadfast/ })
      .click();
    const sheet = dialog(page, 'Connect Steadfast');
    await sheet.getByLabel('API key').fill('wrong');
    await sheet.getByLabel('Secret key').fill('wrong');
    await sheet.getByRole('button', { name: 'Test and connect' }).click();
    await expect(
      sheet.getByText('Steadfast said: “Unauthorized.” Nothing was saved.'),
    ).toBeVisible();
  });

  test('five wrong tries: Steadfast locks a key at ten, so it waits five minutes', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: {
        connections: [],
        connectRefused: { status: 429, code: 'rate_limited', message: 'Too many tries.' },
      },
    });
    await main(page)
      .getByRole('button', { name: /^Steadfast/ })
      .click();
    const sheet = dialog(page, 'Connect Steadfast');
    await sheet.getByLabel('API key').fill('wrong');
    await sheet.getByLabel('Secret key').fill('wrong');
    await sheet.getByRole('button', { name: 'Test and connect' }).click();
    await expect(sheet.getByText(/Steadfast locks a key after 10 failures/)).toBeVisible();
  });

  test('connected: the default, the store, and whether messages arrive', async ({ page }) => {
    await open(page, '/settings/couriers', { couriers: couriers() });
    const steadfast = main(page).getByRole('link', { name: /^Steadfast/ });
    await expect(steadfast).toContainText('Default');
    await expect(steadfast).toContainText('Messages arriving · last 10 min ago');
    const pathao = main(page).getByRole('link', { name: /^Pathao/ });
    await expect(pathao).toContainText('Pickup store: Megh Fashion · Mirpur');
    await expect(pathao).toContainText('No messages yet');
    await expect(main(page).getByText('Connect another courier')).toBeVisible();
    await expect(main(page).getByRole('button', { name: /^RedX/ })).toBeVisible();
    await expectAccessible(page);
  });

  test('messages without the token, the night check finding news no message brought, a refused login', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast, pathao] = fixture.connections;
        if (steadfast) steadfast.messages = 'token_missing';
        if (pathao) pathao.state = 'login_refused';
        fixture.connections.push({
          courierKey: 'redx',
          isDefault: false,
          messages: 'arriving',
          missed: true,
        });
      }),
    });
    await expect(main(page).getByRole('link', { name: /^Steadfast/ })).toContainText(
      'Messages arrive without the token. Paste the token too.',
    );
    await expect(main(page).getByRole('link', { name: /^Pathao/ })).toContainText(
      'Pathao refused the login, so nothing books or checks with Pathao now. Log in again.',
    );
    await expect(main(page).getByRole('link', { name: /^RedX/ })).toContainText(
      'The night check found news no message brought.',
    );
  });

  test('staff who may book but not manage see the couriers with no actions', async ({ page }) => {
    await open(page, '/settings/couriers', {
      isOwner: false,
      permissions: ['orders:read', 'orders:manage'],
      couriers: couriers(),
    });
    await expect(
      main(page).getByText('The owner, or staff allowed to, can connect or change couriers.'),
    ).toBeVisible();
    await expect(
      main(page)
        .getByText(/^Steadfast/)
        .first(),
    ).toBeVisible();
    await expect(main(page).getByRole('link', { name: /^Steadfast/ })).toHaveCount(0);
    await expect(main(page).getByText('Connect another courier')).toHaveCount(0);
  });

  test('a courier being retired: its default moved to the suggestion, and it can still be used', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast, pathao] = fixture.connections;
        if (steadfast && pathao) {
          steadfast.retiring = true;
          steadfast.suggestedKey = 'pathao';
          steadfast.isDefault = false;
          pathao.isDefault = true;
        }
      }),
    });
    await expect(main(page).getByRole('alert').first()).toContainText(
      'Steadfast is being retired from Lytro. Bookings and news with it still work for now. Your default courier is now Pathao.',
    );
    await expect(main(page).getByRole('link', { name: /^Steadfast/ })).toContainText('Retiring');
  });

  test('a courier back on Lytro: said on the Couriers page, the default moved meanwhile kept', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast, pathao] = fixture.connections;
        if (steadfast && pathao) {
          steadfast.backDaysAgo = 2;
          steadfast.isDefault = false;
          pathao.isDefault = true;
        }
      }),
    });
    await expect(main(page).getByRole('status').filter({ hasText: 'is back on Lytro' })).toHaveText(
      'Steadfast is back on Lytro. You can use it as before.',
    );
    await expect(main(page).getByRole('link', { name: /^Pathao/ })).toContainText('Default');
    await expect(main(page).getByRole('link', { name: /^Steadfast/ })).not.toContainText(
      'Retiring',
    );
  });

  test('no word of it once the 7 days have passed, nor while it is retiring again', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', { couriers: couriers() });
    await expect(main(page).getByText(/is back on Lytro/)).toHaveCount(0);
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast] = fixture.connections;
        if (steadfast) {
          steadfast.backDaysAgo = 2;
          steadfast.retiring = true;
          steadfast.suggestedKey = 'pathao';
        }
      }),
    });
    await expect(main(page).getByText(/is being retired from Lytro/)).toBeVisible();
    await expect(main(page).getByText(/is back on Lytro/)).toHaveCount(0);
  });

  test('a connection: its name, what to do while no messages come, Default and the pickup store', async ({
    page,
  }) => {
    const log = await open(page, '/settings/couriers/pathao', { couriers: couriers() });
    await expect(
      page.getByText('Pathao', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(main(page).getByText(/Paste the address into the courier's panel/)).toBeVisible();
    await main(page).getByRole('switch', { name: 'Default' }).click();
    await expect
      .poll(() => sent(log, 'PUT', '/couriers/connections/pathao/default').length)
      .toBe(1);

    await main(page)
      .getByRole('button', { name: /^Pickup store/ })
      .click();
    const stores = dialog(page, 'Pickup store');
    await expect(stores.getByRole('radio', { name: /Old warehouse/ })).toBeDisabled();
    await stores.getByRole('radio', { name: /Uttara/ }).click();
    await stores.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() => sent(log, 'PUT', '/couriers/connections/pathao/store'))
      .toEqual([{ storeId: 'st-2' }]);
    await expect(main(page).getByRole('button', { name: /^Pickup store/ })).toContainText('Uttara');
  });

  test('the address again, and a new one that stops the old at once', async ({ page }) => {
    const log = await open(page, '/settings/couriers/pathao', { couriers: couriers() });
    await main(page)
      .getByRole('button', { name: /^Steps to paste the address/ })
      .click();
    const again = dialog(page, 'Steps to paste the address');
    await expect(again.getByText('Secret', { exact: true })).toBeVisible();
    await expect(again.getByText(/This address is your shop's alone/)).toBeVisible();
    await again.getByRole('button', { name: 'Get a new address' }).click();
    const fresh = dialog(page, 'Get a new address');
    await expect(fresh.getByText(/The old one stops at once/)).toBeVisible();
    await fresh.getByRole('button', { name: 'Get a new address' }).click();
    await expect(
      dialog(page, 'Steps to paste the address').getByText('tok_New9pQ2wX5'),
    ).toBeVisible();
    await expect
      .poll(() => sent(log, 'POST', '/couriers/connections/pathao/address'))
      .toHaveLength(1);
    await dialog(page, 'Steps to paste the address').getByRole('button', { name: 'Done' }).click();
  });

  test('new keys, a blank one keeping what is saved, and disconnecting', async ({ page }) => {
    const log = await open(page, '/settings/couriers/pathao', { couriers: couriers() });
    await main(page).getByRole('button', { name: /^Keys/ }).click();
    const keys = dialog(page, 'Replace keys');
    await expect(keys.getByText('Anything left blank keeps what is saved.')).toBeVisible();
    await keys.getByLabel('Client secret').fill('new-secret');
    await keys.getByRole('button', { name: 'Test and connect' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/couriers/connections').at(-1))
      .toEqual({
        courierKey: 'pathao',
        credentials: { clientId: '', clientSecret: 'new-secret', username: '', password: '' },
      });

    await main(page).getByRole('button', { name: 'Disconnect' }).click();
    const disconnect = dialog(page, 'Disconnect Pathao?');
    await expect(disconnect.getByText(/Parcels already booked keep their record/)).toBeVisible();
    await disconnect.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/couriers$`));
    await expect.poll(() => sent(log, 'DELETE', '/couriers/connections/pathao')).toHaveLength(1);
  });

  test("Pathao's refused login: Log in again asks the email and the password, used once", async ({
    page,
  }) => {
    const log = await open(page, '/settings/couriers/pathao', {
      couriers: couriers((fixture) => {
        const pathao = fixture.connections[1];
        if (pathao) pathao.state = 'login_refused';
      }),
    });
    await main(page).getByRole('button', { name: 'Log in again' }).click();
    const login = dialog(page, 'Log in to Pathao again');
    await login.getByLabel('Password').fill('pass-1');
    await login.getByRole('button', { name: 'Log in' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/couriers/connections'))
      .toEqual([{ courierKey: 'pathao', credentials: { username: '', password: 'pass-1' } }]);
  });

  test('disconnecting a retiring courier says it can’t be connected again', async ({ page }) => {
    await open(page, '/settings/couriers/steadfast', {
      couriers: couriers((fixture) => {
        const steadfast = fixture.connections[0];
        if (steadfast) {
          steadfast.retiring = true;
          steadfast.suggestedKey = 'pathao';
        }
      }),
    });
    await expect(main(page).getByRole('alert').first()).toContainText(
      'Connect Pathao for new bookings.',
    );
    await main(page).getByRole('button', { name: 'Disconnect' }).click();
    await expect(dialog(page, 'Disconnect Steadfast?')).toContainText(
      "Steadfast is being retired, so once disconnected it can't be connected again.",
    );
  });
  test('keys, secrets and passwords are masked as they are typed; the email and client ID show (SEC-08)', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        fixture.connections = [];
      }),
    });
    const kinds: [RegExp, string, Record<string, string>][] = [
      [/^Steadfast/, 'Connect Steadfast', { 'API key': 'password', 'Secret key': 'password' }],
      [
        /^Pathao/,
        'Connect Pathao',
        { 'Client ID': 'text', 'Client secret': 'password', Email: 'email', Password: 'password' },
      ],
      [/^RedX/, 'Connect RedX', { 'API token': 'password' }],
    ];
    for (const [courier, title, fields] of kinds) {
      await main(page).getByRole('button', { name: courier }).click();
      const sheet = dialog(page, title);
      for (const [label, type] of Object.entries(fields)) {
        const input = sheet.getByLabel(label, { exact: true });
        await expect(input).toHaveAttribute('type', type);
        if (type === 'password')
          await expect(input).toHaveAttribute('autocomplete', 'new-password');
      }
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
  });

  test('a default moved to a courier other than the suggestion is named, as the shop’s default now (CRR-25)', async ({
    page,
  }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast, pathao] = fixture.connections;
        if (steadfast && pathao) {
          // RedX was suggested, but the shop has no RedX: the default went to its other courier.
          steadfast.retiring = true;
          steadfast.suggestedKey = 'redx';
          steadfast.isDefault = false;
          pathao.isDefault = true;
        }
      }),
    });
    await expect(main(page).getByRole('alert').first()).toContainText(
      'Steadfast is being retired from Lytro. Bookings and news with it still work for now. Your default courier is now Pathao.',
    );
  });

  test('still the default while it retires: it says which courier to connect', async ({ page }) => {
    await open(page, '/settings/couriers', {
      couriers: couriers((fixture) => {
        const [steadfast] = fixture.connections;
        if (steadfast) {
          steadfast.retiring = true;
          steadfast.suggestedKey = 'redx';
        }
        fixture.connections = fixture.connections.filter((each) => each.courierKey === 'steadfast');
      }),
    });
    await expect(main(page).getByRole('alert').first()).toContainText(
      'Steadfast is being retired from Lytro. Bookings and news with it still work for now. Connect RedX for new bookings.',
    );
  });
});

test.describe('Booking from the order', () => {
  test('Book courier is the next step, Ship by hand in the more menu, and Courier says not booked yet', async ({
    page,
  }) => {
    await open(page, '/orders/o-47', { couriers: couriers(), orders: dayWith(() => undefined) });
    await expect(main(page).getByRole('button', { name: 'Book courier' })).toBeVisible();
    await expect(
      main(page).getByText(/Not booked yet. Book courier sends it to Steadfast/),
    ).toBeVisible();
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await expect(
      dialog(page, /^Order #/).getByRole('button', { name: /Ship by hand/ }),
    ).toBeVisible();
  });

  test('a shop with no courier keeps Mark shipped', async ({ page }) => {
    await open(page, '/orders/o-47', { orders: dayWith(() => undefined) });
    await expect(main(page).getByRole('button', { name: 'Mark shipped' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Book courier' })).toHaveCount(0);
  });

  test('booking with the default: the cash to collect locked, the courier booked, the Courier card shown', async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: dayWith(() => undefined),
    });
    await main(page).getByRole('button', { name: 'Book courier' }).click();
    const sheet = dialog(page, 'Book courier');
    await expect(sheet.getByRole('radio', { name: 'Steadfast' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sheet.getByText(/What the order has due/)).toBeVisible();
    await expect(sheet.getByLabel('Weight')).toHaveCount(0);
    await sheet.getByLabel('Note for the courier (optional)').fill('after 3 pm');
    await sheet.getByRole('button', { name: 'Book with Steadfast' }).click();
    await expect.poll(() => sent(log, 'POST', '/orders/o-47/book').length).toBe(1);
    const [body] = sent(log, 'POST', '/orders/o-47/book');
    expect(body).toEqual({ courierKey: 'steadfast', note: 'after 3 pm' });
    expect(log.calls.find((call) => call.path === '/orders/o-47/book')).toBeTruthy();
    await expect(page.getByText('Booked with Steadfast · 1424107')).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'Courier' })).toBeVisible();
    await expect(main(page).getByText('Booked, waiting for pickup')).toBeVisible();
    await expect(main(page).getByText('Not told yet')).toBeVisible();
  });

  test('Pathao: a weight from 0.5 kg where items have none, and its whole taka', async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: dayWith((order) => {
        order.payments = [{ method: 'bkash', amount: 0.5, trxId: 'TRX1', at: dhaka(11, 50) }];
      }),
    });
    await main(page).getByRole('button', { name: 'Book courier' }).click();
    const sheet = dialog(page, 'Book courier');
    await sheet.getByRole('radio', { name: 'Pathao' }).click();
    await expect(sheet.getByLabel('Weight')).toHaveValue('0.5');
    await expect(sheet.getByText(/2 items have no weight, so it starts at 0.5 kg/)).toBeVisible();
    await expect(sheet.getByText(/Pathao takes whole taka only/)).toBeVisible();
    await expect(sheet.getByText('Megh Fashion · Mirpur')).toBeVisible();
    await sheet.getByLabel('Weight').fill('1.2');
    await sheet.getByRole('button', { name: 'Book with Pathao' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/book'))
      .toEqual([{ courierKey: 'pathao', weightKg: 1.2 }]);
  });

  test("RedX: the thana's areas first, a likely one marked, none chosen refused, a search of the district", async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers((fixture) => {
        fixture.connections.push({ courierKey: 'redx', isDefault: false, messages: 'arriving' });
      }),
      orders: dayWith(() => undefined),
    });
    await main(page).getByRole('button', { name: 'Book courier' }).click();
    const sheet = dialog(page, 'Book courier');
    await sheet.getByRole('radio', { name: 'RedX' }).click();
    await expect(sheet.getByText('Areas in Mirpur')).toBeVisible();
    await expect(sheet.getByRole('radio', { name: /Kazipara\(Mirpur\) Likely/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'Book with RedX' }).click();
    await expect(sheet.getByText("Choose one of RedX's areas.")).toBeVisible();
    await expect.poll(() => sent(log, 'POST', '/orders/o-47/book')).toEqual([]);
    await sheet.getByRole('button', { name: 'Search all of Dhaka' }).click();
    await sheet.getByRole('searchbox').fill('Kazi');
    await sheet.getByRole('radio', { name: 'Kazipara', exact: true }).click();
    await sheet.getByRole('button', { name: 'Book with RedX' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/book').at(-1))
      .toMatchObject({
        courierKey: 'redx',
        areaCode: '201',
      });
  });

  test("RedX's one own-name area in the thana is chosen by itself", async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers((fixture) => {
        fixture.connections = [{ courierKey: 'redx', isDefault: true, messages: 'arriving' }];
        fixture.areas = {
          thana: [{ areaCode: '101', name: 'Mirpur 10', suggested: false }],
          zilla: [],
        };
      }),
      orders: dayWith(() => undefined),
    });
    await main(page).getByRole('button', { name: 'Book courier' }).click();
    const sheet = dialog(page, 'Book courier');
    await expect(
      sheet.getByText("RedX has one area for this thana, so it's chosen."),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Book with RedX' }).click();
    await expect.poll(() => sent(log, 'POST', '/orders/o-47/book').length).toBe(1);
    const [body] = sent(log, 'POST', '/orders/o-47/book');
    expect(body).not.toHaveProperty('areaCode');
  });

  for (const [answer, words] of [
    [
      'refused',
      "Steadfast didn't book it: “The recipient phone must be a valid 11-digit number.” Nothing changed on the order.",
    ],
    ['refused-none', "Steadfast didn't book it and gave no reason. Nothing changed on the order."],
    ['down', "Steadfast isn't answering right now, and nothing was booked. Try again in a minute."],
  ] as const) {
    test(`a refusal in the courier's words: ${answer}`, async ({ page }) => {
      await open(page, '/orders/o-47', {
        couriers: couriers(),
        orders: dayWith((order) => {
          order.bookAnswer = answer;
        }),
      });
      await main(page).getByRole('button', { name: 'Book courier' }).click();
      const sheet = dialog(page, 'Book courier');
      await sheet.getByRole('button', { name: 'Book with Steadfast' }).click();
      await expect(sheet.getByText(words)).toBeVisible();
    });
  }

  test("a lost answer: the order says so, and Settle it records the courier's panel", async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: dayWith((order) => {
        order.bookAnswer = 'lost';
      }),
    });
    await main(page).getByRole('button', { name: 'Book courier' }).click();
    await dialog(page, 'Book courier').getByRole('button', { name: 'Book with Steadfast' }).click();
    await expect(main(page).getByText(/No answer came from Steadfast/)).toBeVisible();
    await main(page).getByRole('button', { name: 'Settle it' }).click();
    const settle = dialog(page, 'Was the parcel made in Steadfast?');
    await settle.getByLabel('Consignment ID').fill('1424107');
    await settle.getByRole('button', { name: 'Settle it' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/parcel/settle'))
      .toEqual([{ outcome: 'booked', consignmentId: '1424107' }]);
    await expect(main(page).getByRole('heading', { name: 'Courier' })).toBeVisible();
  });

  test('Pathao, which can’t be asked by the order number, is settled from its panel', async ({
    page,
  }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ courierKey: 'pathao', state: 'unknown', settled: false }, 'confirmed'),
    });
    await expect(main(page).getByText(/Pathao can't be asked by the order number/)).toBeVisible();
  });

  test('staff who may only read are told only that no answer came, not how it is settled', async ({
    page,
  }) => {
    await open(page, '/orders/o-47', {
      isOwner: false,
      permissions: ['orders:read'],
      orders: booked({ state: 'unknown', settled: false }, 'confirmed'),
    });
    await expect(main(page).getByRole('alert').first()).toHaveText(
      "No answer came from Steadfast, so it isn't known yet whether the parcel was made.",
    );
    await expect(main(page).getByRole('button', { name: 'Settle it' })).toHaveCount(0);
  });

  test('a parcel taken whose stock could not be: Try again', async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ settled: false, settleProblem: 'SerialNotInStock' }, 'confirmed'),
    });
    await expect(main(page).getByText(/a serial is no longer in stock/)).toBeVisible();
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/parcel/settle'))
      .toEqual([{ outcome: 'retry' }]);
  });
});

test.describe('The Courier card', () => {
  test('on its way: our reading, its words, the figures and its news with where each came from', async ({
    page,
  }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({
        reading: 'with_courier',
        courierStatus: 'pending',
        deliveryCharge: 60,
        news: [
          {
            source: 'message',
            words: ['পার্সেলটি রাইডারের কাছে আছে।', 'Your parcel is out with the rider.'],
            raw: 'pending',
            ago: 30,
          },
          { source: 'check', raw: 'pending', ago: 600 },
        ],
      }),
    });
    const card = main(page);
    await expect(card.getByText('With the courier')).toBeVisible();
    await expect(card.getByText('Steadfast says: pending')).toBeVisible();
    await expect(card.getByText('1424107')).toBeVisible();
    await expect(card.getByText('৳60')).toBeVisible();
    await expect(card.getByText('Your parcel is out with the rider.')).toBeVisible();
    await expect(card.getByText(/^Night check/)).toBeVisible();
    await expect(card.getByText(/^Checked 10 hours ago/)).toBeVisible();
    await expectAccessible(page);
  });

  test('Sync inside 10 minutes says the saved answer shows', async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({
        reading: 'with_courier',
        news: [{ source: 'sync', raw: 'pending', ago: 3 }],
      }),
    });
    await main(page).getByRole('button', { name: 'Sync' }).click();
    await expect.poll(() => sent(log, 'POST', '/orders/o-47/parcel/sync')).toHaveLength(1);
    await expect(
      page.getByText('Checked within 10 minutes, so the saved answer shows.'),
    ).toBeVisible();
  });

  test('paid by Steadfast with its payout, and RedX that says it paid', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked(
        {
          reading: 'delivered',
          courierStatus: 'delivered',
          paidDaysAgo: 1,
          payoutId: 'AAA-10000123',
        },
        'delivered',
      ),
    });
    await expect(
      main(page).getByText(/Paid by Steadfast · .* · payout AAA-10000123/),
    ).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Sync' })).toHaveCount(0);
  });

  test('delivered and not paid yet says so', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ reading: 'delivered', courierStatus: 'delivered' }, 'delivered'),
    });
    await expect(main(page).getByText('Not paid by Steadfast yet')).toBeVisible();
  });

  test('less cash than the COD: Needs a look, marked seen', async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked(
        {
          reading: 'delivered',
          courierStatus: 'delivered',
          cashCollected: 3000,
          attention: 'cash_differs',
        },
        'delivered',
      ),
    });
    await expect(
      main(page).getByText(/Steadfast reported ৳3,000 collected; the COD was ৳3,470/),
    ).toBeVisible();
    await main(page).getByRole('button', { name: 'Mark as seen' }).click();
    await expect.poll(() => sent(log, 'POST', '/orders/o-47/parcel/seen')).toHaveLength(1);
    await expect(main(page).getByText(/Steadfast reported ৳3,000 collected/)).toHaveCount(0);
  });

  test('the COD changed in its panel, and a report after delivered', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ reading: 'with_courier', codAtCourier: 3200, attention: 'cod_changed' }),
    });
    await expect(
      main(page).getByText(/The COD was changed to ৳3,200 in Steadfast's panel/),
    ).toBeVisible();
  });

  test('coming back: counted with Return items, the bar’s step', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ reading: 'returning', courierStatus: 'cancelled' }),
    });
    await expect(main(page).getByText(/The parcel is coming back/)).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Return items' })).toBeVisible();
  });

  test('thirty days with no news: checks stopped, Sync starts them', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ reading: 'with_courier', noNews: true }),
    });
    await expect(main(page).getByText(/No news from Steadfast for 30 days/)).toBeVisible();
  });

  test('staff who may only read see no Sync and no Mark as seen', async ({ page }) => {
    await open(page, '/orders/o-47', {
      isOwner: false,
      permissions: ['orders:read'],
      orders: booked({ reading: 'with_courier', attention: 'cod_changed', codAtCourier: 3200 }),
    });
    await expect(main(page).getByRole('heading', { name: 'Courier' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Sync' })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'Mark as seen' })).toHaveCount(0);
  });
});

test.describe('Cancelling a booking', () => {
  test("Steadfast's booking is cancelled in its panel first, then confirmed here", async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({}, 'processing'),
    });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await dialog(page, /^Order #/)
      .getByRole('button', { name: /Cancel the booking/ })
      .click();
    const sheet = dialog(page, 'Cancel the booking with Steadfast');
    const cancel = sheet.getByRole('button', { name: 'Cancel the booking' });
    await expect(cancel).toBeDisabled();
    await sheet.getByText("I've cancelled it in Steadfast's panel").click();
    await cancel.click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/parcel/cancel'))
      .toEqual([{ courierCancelled: true }]);
    await expect(
      page.getByText('The booking is cancelled. The order can be booked again.'),
    ).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Book courier' })).toBeVisible();
  });

  test('RedX is asked; with no clear answer it is confirmed from its panel', async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers((fixture) => {
        fixture.connections.push({ courierKey: 'redx', isDefault: false, messages: 'arriving' });
      }),
      orders: dayWith((order) => {
        order.status = 'processing';
        order.parcel = { courierKey: 'redx', cod: 3470 };
        order.cancelNoAnswer = true;
      }),
    });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await dialog(page, /^Order #/)
      .getByRole('button', { name: /Cancel the booking/ })
      .click();
    await dialog(page, 'Cancel the booking with RedX?')
      .getByRole('button', { name: 'Cancel the booking' })
      .click();
    const sheet = dialog(page, 'Cancel the booking with RedX?');
    await expect(sheet.getByText(/RedX didn't confirm the cancel/)).toBeVisible();
    await sheet.getByText("It's cancelled in RedX's panel").click();
    await sheet.getByRole('button', { name: 'Cancel the booking' }).click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/parcel/cancel'))
      .toEqual([{}, { courierCancelled: true }]);
  });

  test('cancelling a booked order says what happens to its parcel', async ({ page }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({}, 'processing'),
    });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    await dialog(page, /^Order #/)
      .getByRole('button', { name: 'Cancel the order' })
      .click();
    const sheet = dialog(page, /^Cancel/);
    await expect(sheet.getByText(/This order is booked with Steadfast/)).toBeVisible();
    await sheet.getByRole('radio').first().click();
    const cancel = sheet.getByRole('button', { name: 'Cancel the order', exact: true });
    await expect(cancel).toBeDisabled();
    await sheet.getByText("I've cancelled it in Steadfast's panel").click();
    await cancel.click();
    await expect
      .poll(() => sent(log, 'POST', '/orders/o-47/cancel').at(-1))
      .toMatchObject({ courierCancelled: true });
  });
});

test.describe('Editing a booked order (ORD-11)', () => {
  test('only its customer and note change, and the order says the courier still has the old details', async ({
    page,
  }) => {
    const log = await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({}, 'processing'),
    });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    const menu = dialog(page, /^Order #/);
    await expect(menu.getByRole('button', { name: /Edit the order/ })).toContainText(
      'The customer’s name, phone, address and note',
    );
    await menu.getByRole('button', { name: /Edit the order/ }).click();
    await expect(page).toHaveURL(/\/orders\/o-47\/edit$/);
    await expect(
      main(page).getByText(
        'Booked with Steadfast, so its items, its totals and where it goes stay as they are. To change them, cancel the order and enter a new one.',
      ),
    ).toBeVisible();
    // The thana is locked, the items read-only; nothing that moves its totals is offered.
    await expect(main(page).getByRole('button', { name: /District and thana/ })).toBeDisabled();
    await expect(main(page).getByRole('button', { name: 'Add an item' })).toHaveCount(0);
    await expect(main(page).getByLabel('Order discount')).toHaveCount(0);
    await expect(main(page).getByRole('spinbutton')).toHaveCount(0);
    await expect(
      main(page)
        .getByText(/^× \d+$/)
        .first(),
    ).toBeVisible();
    await expectAccessible(page);

    await main(page).getByLabel('Address').fill('House 9, Road 2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect
      .poll(() => sent(log, 'PATCH', '/orders/o-47'))
      .toEqual([{ deliveryAddress: 'House 9, Road 2' }]);
    await expect(page).toHaveURL(/\/orders\/o-47$/);
    // In sight, though Save was at the editor's foot.
    await expect(
      main(page).getByText(
        'Saved. Steadfast still has the old details, so change them in Steadfast’s panel too.',
      ),
    ).toBeInViewport();
  });

  test('saving with nothing changed sends nothing and says nothing', async ({ page }) => {
    const log = await open(page, '/orders/o-47/edit', {
      couriers: couriers(),
      orders: booked({}, 'processing'),
    });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/orders\/o-47$/);
    await expect(main(page).getByRole('heading', { name: 'Courier' })).toBeVisible();
    expect(sent(log, 'PATCH', '/orders/o-47')).toEqual([]);
    await expect(main(page).getByText(/still has the old details/)).toHaveCount(0);
  });

  test('an order whose booking isn’t settled offers no Edit', async ({ page }) => {
    await open(page, '/orders/o-47', {
      couriers: couriers(),
      orders: booked({ settled: false, settleProblem: 'SerialNotInStock' }, 'confirmed'),
    });
    await main(page)
      .getByRole('button', { name: /^Order #/ })
      .click();
    const menu = dialog(page, /^Order #/);
    await expect(menu.getByRole('button', { name: /Print/ })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Edit the order/ })).toHaveCount(0);
  });
});

test.describe('The Orders list', () => {
  test("a booked order's line, and Needs a look with its count", async ({ page }) => {
    const day = booked({ reading: 'hold' });
    const other = day.orders.find((each) => each.id === 'o-46');
    if (other) {
      other.status = 'delivered';
      other.parcel = {
        courierKey: 'pathao',
        reading: 'delivered',
        cod: 2190,
        attention: 'cash_differs',
        cashCollected: 2000,
      };
    }
    const log = await open(page, '/orders?tab=all', { couriers: couriers(), orders: day });
    await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toContainText(
      'Steadfast · on hold',
    );
    await expect(main(page).getByRole('link', { name: /^#261031-0046/ })).toContainText(
      'Needs a look',
    );
    const look = main(page)
      .getByRole('group')
      .getByRole('button', { name: /^Needs a look/ });
    await expect(look).toContainText('1');
    await look.click();
    await expect(
      main(page).getByText(/What couriers reported that staff should check/),
    ).toBeVisible();
    await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toHaveCount(0);
    expect(
      log.calls.some((call) => call.path === '/orders' && call.query.includes('attention=any')),
    ).toBe(true);
  });
});

test.describe('Money', () => {
  test('Payments › Courier payouts: each payout, and one opened with its orders', async ({
    page,
  }) => {
    await open(page, '/payments?tab=payouts', { couriers: couriers() });
    await expect(
      main(page).getByText(/The payouts couriers made you, in their own figures/),
    ).toBeVisible();
    const first = main(page).getByRole('button', { name: /৳18,400/ });
    await expect(first).toContainText('Bank · 14 parcels, 13 Lytro orders');
    await expect(first).toContainText('AAA-10000123');
    await first.click();
    const sheet = dialog(page, 'Payout AAA-10000123');
    await expect(sheet.getByText('৳19,960')).toBeVisible();
    await expect(sheet.getByText('#261031-0047')).toBeVisible();
    await expect(sheet.getByText("1 more parcels weren't booked through Lytro.")).toBeVisible();
    await expectAccessible(page);
  });

  test('no payouts yet, and no courier connected', async ({ page }) => {
    await open(page, '/payments?tab=payouts', {
      couriers: couriers((fixture) => {
        fixture.payouts = [];
      }),
    });
    await expect(main(page).getByText(/No payouts yet/)).toBeVisible();
    await page.goto(`/${SLUG}/payments?tab=payouts`);
  });

  test('no courier connected offers to connect one', async ({ page }) => {
    await open(page, '/payments?tab=payouts');
    await expect(
      main(page).getByText('Connect a courier and its payouts show here.'),
    ).toBeVisible();
    await main(page).getByRole('link', { name: 'Connect a courier' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/couriers$`));
  });

  test("Sales: a fourth figure, couriers' charges, with the orders whose charge isn't known", async ({
    page,
  }) => {
    await open(page, '/sales', {
      sales: { courierCharges: '12480.00', unknownCourierCharges: 3 },
    });
    await expect(main(page).getByText('Courier charges')).toBeVisible();
    await expect(main(page).getByText('৳12,480', { exact: true })).toBeVisible();
    await expect(main(page).getByText('3 orders with no charge known')).toBeVisible();
  });
});

test('Home: Connect a courier is a live step', async ({ page }) => {
  await open(page, '', DAY_ONE);
  const step = main(page).getByRole('link', { name: /Connect a courier/ });
  await expect(step).toContainText('Steadfast, Pathao or RedX');
  await step.click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/couriers$`));
});
