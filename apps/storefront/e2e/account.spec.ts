import { OrderStatus } from '@lytronix/validators/enums';
import { expect, type Page, test } from '@playwright/test';
import { CODE, idOf, rumana, RUMANA_PASSWORD, THANA, trackedOrder } from './support/fixtures';
import {
  alertOn,
  callFromPage,
  fillOrderForm,
  hijabLine,
  openShop,
  seedCart,
  serverSignIn,
  signIn,
} from './support/shop';

// CUS-03 to CUS-07, CUS-14, ORD-18, AUTH-14 (Slice 4.8e, part 2): the shopper's account: sign-in, sign-up, my orders, saved
// addresses, the profile, and what a sign-in changes elsewhere. The token stays out of every script.

const withRumana = () => ({ shoppers: [rumana('en')] });

async function fillSignIn(page: Page, phone: string, password: string) {
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('sign in (CUS-03)', () => {
  test('the header leads there signed out, then to the account; the footer too', async ({
    page,
  }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/'));
    await expect(
      page.locator('footer.foot').getByRole('link', { name: 'Account' }),
    ).toHaveAttribute('href', '/account');
    await page.locator('.hdr').getByRole('link', { name: 'Account' }).click();
    await page.waitForURL('**/sign-in?next=%2Faccount');
    await fillSignIn(page, '01711 223344', RUMANA_PASSWORD);
    await page.waitForURL('**/account');
    await expect(page.getByRole('heading', { name: 'Hello, Rumana' })).toBeVisible();
    await page.locator('.hdr').getByRole('link', { name: 'Account' }).click();
    await expect(page.getByRole('heading', { name: 'Hello, Rumana' })).toBeVisible();
  });

  test('keeps the sign-in out of every script: an http-only cookie, and no token in the answer', async ({
    page,
  }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-in'));
    const answer = await callFromPage(page, 'POST', '/api/shopper/signin', {
      phone: '01711223344',
      password: RUMANA_PASSWORD,
    });
    expect(answer.status).toBe(200);
    expect(answer.body).not.toContain('token');
    expect(answer.body).toContain('Rumana');
    const cookies = await page.context().cookies(shop.url('/'));
    const sign = cookies.find((cookie) => cookie.name === 'lytro-shopper');
    expect(sign?.httpOnly).toBe(true);
    expect(sign?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('lytro-shopper');
  });

  test('a wrong password says the two do not match, not which', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-in'));
    await fillSignIn(page, '01711223344', 'not-the-password');
    await expect(alertOn(page)).toHaveText("That phone and password don't match");
    await page.getByLabel('Mobile number').fill('01999999999');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(alertOn(page)).toHaveText("That phone and password don't match");
  });

  test('five wrong tries lock it (AUTH-14)', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-in'));
    await page.getByLabel('Mobile number').fill('01711223344');
    await page.getByLabel('Password').fill('not-the-password');
    const submit = page.getByRole('button', { name: 'Sign in', exact: true });
    for (let tries = 0; tries < 5; tries += 1) {
      const answered = page.waitForResponse('**/api/shopper/signin');
      await submit.click();
      await answered;
      await expect(submit).toBeEnabled();
    }
    await submit.click();
    await expect(alertOn(page)).toHaveText('Too many tries. Try again in 15 minutes.');
    await expect(submit).toBeDisabled();
  });

  test('a phone that is not one is its own error, and nothing is sent', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-in'));
    await fillSignIn(page, '0171', RUMANA_PASSWORD);
    await expect(page.getByText('Enter a valid mobile number (01XXXXXXXXX)')).toBeVisible();
    expect((await shop.sent()).shopperRequests).toBe(0);
  });

  test('forgetting it asks the shop (CUS-14)', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-in'));
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText("Ask the shop; they'll set a new one and send it to you.");
    await expect(sheet.getByRole('link', { name: 'Call the shop' })).toHaveAttribute(
      'href',
      'tel:01711-223344',
    );
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/8801711223344',
    );
  });

  test('leads back where it was asked from, and never to another site', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await page.getByRole('link', { name: 'Sign in to fill this in' }).click();
    await page.waitForURL('**/sign-in?next=/checkout');
    await fillSignIn(page, '01711223344', RUMANA_PASSWORD);
    await page.waitForURL('**/checkout');
    await expect(page.locator('.side .cl')).toContainText('Chiffon Hijab');

    await page.context().clearCookies({ name: 'lytro-shopper' });
    for (const away of ['https://elsewhere.example/', '//elsewhere.example/']) {
      await page.context().clearCookies({ name: 'lytro-shopper' });
      await page.goto(shop.url(`/sign-in?next=${encodeURIComponent(away)}`));
      await fillSignIn(page, '01711223344', RUMANA_PASSWORD);
      await page.waitForURL('**/account');
    }
  });

  test('someone already signed in goes straight on', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await page.goto(shop.url('/sign-in'));
    await page.waitForURL('**/account');
    await page.goto(shop.url('/sign-up'));
    await page.waitForURL('**/account');
  });
});

test.describe('sign up (CUS-03, CUS-04, CUS-07)', () => {
  async function toCodeStep(page: Page) {
    await page.getByLabel('Mobile number').fill('01811 000000');
    await page.getByRole('button', { name: 'Send the code' }).click();
    await expect(page.getByRole('heading', { name: '6-digit code' })).toBeVisible();
  }

  async function toDetailsStep(page: Page, code = CODE) {
    await toCodeStep(page);
    await page.locator('#su-code').fill(code);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Last step' })).toBeVisible();
  }

  async function makeTheAccount(page: Page) {
    await page.getByLabel('Name').fill('Rafi');
    await page.getByLabel('Password').fill('a-good-password');
    await page.getByRole('button', { name: 'Make the account' }).click();
  }

  test('the phone, the code, the name and a password make the account, signed in', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/sign-up'));
    await expect(page.getByText('We send a code once')).toBeVisible();
    await toDetailsStep(page);
    await expect(page.locator('.sub', { hasText: '01811 000000' })).toBeVisible();
    await makeTheAccount(page);
    await page.waitForURL('**/account');
    await expect(page.getByRole('heading', { name: 'Hello, Rafi' })).toBeVisible();
    await expect(page.getByText('No orders yet')).toBeVisible();
  });

  test('a phone with an account already says to sign in', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page.goto(shop.url('/sign-up'));
    await page.getByLabel('Mobile number').fill('01711223344');
    await page.getByRole('button', { name: 'Send the code' }).click();
    await expect(alertOn(page)).toContainText('This phone already has an account');
    await expect(page.getByRole('link', { name: 'Have an account? Sign in' })).toBeVisible();
  });

  test("a shop that can't pay for the code says so, with Call the shop (SMS-11)", async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({
      nextCodes: [{ status: 429, code: 'quota_exceeded' }],
    }));
    await page.goto(shop.url('/sign-up'));
    await page.getByLabel('Mobile number').fill('01811000000');
    await page.getByRole('button', { name: 'Send the code' }).click();
    await expect(alertOn(page)).toContainText("The shop can't send a code right now");
    await expect(page.getByRole('link', { name: 'Call the shop' })).toBeVisible();
  });

  test('too many asks, and a text that failed, each say what to do', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextCodes: [
        { status: 429, code: 'rate_limited' },
        { status: 503, code: 'service_unavailable' },
      ],
    }));
    await page.goto(shop.url('/sign-up'));
    await page.getByLabel('Mobile number').fill('01811000000');
    await page.getByRole('button', { name: 'Send the code' }).click();
    await expect(alertOn(page)).toContainText('Too many tries just now');
    await page.getByRole('button', { name: 'Send the code' }).click();
    await expect(alertOn(page)).toContainText("The code didn't go out");
  });

  test('a wrong code comes back to its step, keeping what was typed, and goes through once right', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/sign-up'));
    await toDetailsStep(page, '111111');
    await makeTheAccount(page);
    await expect(page.getByRole('heading', { name: '6-digit code' })).toBeVisible();
    await expect(alertOn(page)).toHaveText("That code isn't right");
    await page.locator('#su-code').fill(CODE);
    await expect(alertOn(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('Rafi');
    await page.getByRole('button', { name: 'Make the account' }).click();
    await page.waitForURL('**/account');
  });

  test('a code run out, or too many wrong tries, needs a new one', async ({ page }) => {
    const shop = await openShop(page, () => ({ resendAfterSeconds: 1 }));
    await page.goto(shop.url('/sign-up'));
    await toDetailsStep(page, '000000');
    await makeTheAccount(page);
    await expect(alertOn(page)).toHaveText('That code has run out. Ask for a new one.');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await page.getByRole('button', { name: 'Resend' }).click();
    await expect(alertOn(page)).toHaveCount(0);
    await expect(page.locator('#su-code')).toHaveValue('');
    await page.locator('#su-code').fill('999999');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Make the account' }).click();
    await expect(alertOn(page)).toHaveText('Too many wrong tries. Ask for a new code.');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('Resend waits for its time', async ({ page }) => {
    const shop = await openShop(page, () => ({ resendAfterSeconds: 2 }));
    await page.goto(shop.url('/sign-up'));
    await toCodeStep(page);
    await expect(page.getByText(/You can ask again in \d seconds/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resend' })).toBeVisible();
  });

  test('no name, or a password out of bounds, are their fields’ errors, and nothing is sent', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/sign-up'));
    await toDetailsStep(page);
    const sent = (await shop.sent()).shopperRequests;
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Make the account' }).click();
    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('A password is 8 to 20 characters')).toBeVisible();
    expect((await shop.sent()).shopperRequests).toBe(sent);
  });
});

test.describe('my orders (ORD-18)', () => {
  test('lists every order with the phone, each opening its tracking', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await page.goto(shop.url('/account'));
    await expect(
      page.getByText('Every order with this phone, wherever you placed it'),
    ).toBeVisible();
    const rows = page.locator('a.cl');
    await expect(rows).toHaveCount(3);
    const first = rows.first();
    await expect(first).toContainText('#261031-0047');
    await expect(first).toContainText('31 Oct 2026');
    await expect(first).toContainText('Shipped');
    await expect(first).toContainText('৳3,570');
    await expect(first).toHaveAttribute(
      'href',
      `/track/${idOf('261031-0047').slice(0, 8).toUpperCase()}`,
    );
    await expect(rows.nth(1)).toContainText('Delivered');
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
  });

  test('none yet says so', async ({ page }) => {
    const shop = await openShop(page, () => ({ shoppers: [rumana('en', { orders: [] })] }));
    await signIn(page, shop);
    await page.goto(shop.url('/account'));
    await expect(page.getByText('No orders yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Keep shopping' })).toHaveAttribute('href', '/');
  });

  test('Show more reads the next page, and goes when there is none', async ({ page }) => {
    const orders = Array.from({ length: 25 }, (_, at) => ({
      orderNumber: `261031-${String(at).padStart(4, '0')}`,
      trackingId: `TRACK${String(at).padStart(3, '0')}`,
      status: OrderStatus.Delivered,
      grandTotal: '100.00',
      createdAt: '2026-10-31T05:42:00.000Z',
    }));
    const shop = await openShop(page, () => ({ shoppers: [rumana('en', { orders })] }));
    await signIn(page, shop);
    await page.goto(shop.url('/account'));
    await expect(page.locator('a.cl')).toHaveCount(20);
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(page.locator('a.cl')).toHaveCount(25);
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
  });

  test('Sign out ends it, and the account leads to Sign in again', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await page.goto(shop.url('/account'));
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(shop.url('/'));
    const cookies = await page.context().cookies(shop.url('/'));
    expect(cookies.some((cookie) => cookie.name === 'lytro-shopper')).toBe(false);
    await page.goto(shop.url('/account'));
    await page.waitForURL('**/sign-in?next=%2Faccount');
  });

  test('a sign-in the server no longer takes leads to Sign in', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await page
      .context()
      .addCookies([{ name: 'lytro-shopper', value: 'stale-token', url: shop.url('/') }]);
    await page.goto(shop.url('/account'));
    await page.waitForURL('**/sign-in?next=%2Faccount');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('saved addresses (CUS-06)', () => {
  const addressesPage = async (page: Page, extra: Parameters<typeof rumana>[1] = {}) => {
    const shop = await openShop(page, () => ({ shoppers: [rumana('en', extra)] }));
    await signIn(page, shop);
    await page.goto(shop.url('/account/addresses'));
    return shop;
  };

  test('each says its label, its place and whether it is the default', async ({ page }) => {
    await addressesPage(page);
    const cards = page.locator('.card2');
    await expect(cards.first()).toContainText('Home');
    await expect(cards.first()).toContainText('Default');
    await expect(cards.first()).toContainText('House 12/B, Road 3, Mirpur 10 · Mirpur, Dhaka');
    await expect(cards.nth(1)).toContainText('Office');
    await expect(cards.nth(1)).not.toContainText('Default');
  });

  test('adds one, the fields held first', async ({ page }) => {
    const shop = await addressesPage(page);
    await page.getByRole('button', { name: /Add an address · Up to 10/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Enter a label')).toBeVisible();
    await expect(sheet.getByText('Pick a thana')).toBeVisible();
    await expect(sheet.getByText('Address is needed')).toBeVisible();

    await sheet.getByLabel('Label').fill('Parents');
    await sheet.getByLabel('District').selectOption({ label: 'Gazipur' });
    await sheet.getByLabel('Thana').selectOption({ label: 'Tongi' });
    await sheet.getByLabel('Full address').fill('House 9, Tongi');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const added = page.locator('.card2', { hasText: 'Parents' });
    await expect(added).toContainText('House 9, Tongi · Tongi, Gazipur');
    await expect(added).not.toContainText('Default');
    const saved = (await shop.sent()).shoppers[0]?.addresses;
    expect(saved?.find((row) => row.label === 'Parents')?.location?.id).toBe(12);
  });

  test('the first saved is the default', async ({ page }) => {
    await addressesPage(page, { addresses: [] });
    await expect(page.getByText('No saved addresses yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add an address' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('checkbox', { name: 'Make it the default' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByLabel('Label').fill('Home');
    await sheet.getByLabel('District').selectOption({ label: 'Dhaka' });
    await sheet.getByLabel('Thana').selectOption({ label: 'Mirpur' });
    await sheet.getByLabel('Full address').fill('House 1');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.card2', { hasText: 'Home' })).toContainText('Default');
  });

  test('edits one, opening as saved, and makes it the default', async ({ page }) => {
    await addressesPage(page);
    await page.getByRole('button', { name: 'Edit Office' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit address' });
    await expect(sheet.getByLabel('Label')).toHaveValue('Office');
    await expect(sheet.getByLabel('Thana')).toHaveValue(String(THANA.tejgaon));
    await expect(sheet.getByLabel('District')).toHaveValue('1');
    await sheet.getByLabel('Full address').fill('Level 6, Kawran Bazar');
    await sheet.getByRole('checkbox', { name: 'Make it the default' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const cards = page.locator('.card2');
    await expect(cards.first()).toContainText('Level 6, Kawran Bazar');
    await expect(cards.first()).toContainText('Default');
    await expect(cards.nth(1)).not.toContainText('Default');
  });

  test('the default stays until another is made it', async ({ page }) => {
    await addressesPage(page);
    await page.getByRole('button', { name: 'Edit Home' }).click();
    await expect(page.getByRole('checkbox', { name: 'Make it the default' })).toBeDisabled();
  });

  test('deletes one; when the default goes, another takes its place', async ({ page }) => {
    await addressesPage(page);
    await page.getByRole('button', { name: 'Edit Home' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.card2')).toHaveCount(1);
    await expect(page.locator('.card2')).toContainText('Office');
    await expect(page.locator('.card2')).toContainText('Default');
  });

  test('ten saved holds Add an address', async ({ page }) => {
    const home = rumana('en').addresses[0];
    if (!home) throw new Error('Rumana has a home');
    const addresses = Array.from({ length: 10 }, (_, at) => ({
      ...home,
      id: idOf(`address-${String(at)}`),
      label: `Place ${String(at)}`,
      isDefault: at === 0,
    }));
    await addressesPage(page, { addresses });
    await expect(page.getByRole('button', { name: 'Add an address' })).toBeDisabled();
    await expect(page.getByText('You have 10. Delete one to add another.')).toBeVisible();
  });
});

test.describe('the profile (CUS-05)', () => {
  const profilePage = async (page: Page) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await page.goto(shop.url('/account/profile'));
    return shop;
  };

  test('changes the name; the phone stays, saying why', async ({ page }) => {
    const shop = await profilePage(page);
    await expect(page.getByLabel('Mobile number')).toBeDisabled();
    await expect(page.getByLabel('Mobile number')).toHaveValue('01711223344');
    await expect(page.getByText("The phone can't change; it is your account")).toBeVisible();
    await page.getByLabel('Name').fill('Rumana Akter');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
    expect((await shop.sent()).shoppers[0]?.name).toBe('Rumana Akter');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hello, Rumana Akter' })).toBeVisible();
  });

  test('an empty name is held', async ({ page }) => {
    await profilePage(page);
    await page.getByLabel('Name').fill('  ');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter your name')).toBeVisible();
  });

  test('changes the password, given the current one, and says the other sign-ins ended', async ({
    page,
  }) => {
    const shop = await profilePage(page);
    await page.getByLabel('Current password').fill(RUMANA_PASSWORD);
    await page.getByLabel('New password').fill('a-new-password');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Password changed. Your other sign-ins have ended.',
    );
    await expect(page.getByLabel('Current password')).toHaveValue('');
    expect((await shop.sent()).shoppers[0]?.password).toBe('a-new-password');
  });

  test('a wrong current password, and a new one out of bounds, are their fields’ errors', async ({
    page,
  }) => {
    const shop = await profilePage(page);
    await page.getByLabel('Current password').fill('not-the-password');
    await page.getByLabel('New password').fill('short');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('A password is 8 to 20 characters')).toBeVisible();
    await page.getByLabel('New password').fill('a-new-password');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText("That isn't your current password")).toBeVisible();
    expect((await shop.sent()).shoppers[0]?.password).toBe(RUMANA_PASSWORD);
  });
});

test.describe('what a sign-in changes elsewhere', () => {
  test('checkout opens filled in from the account, its saved addresses as chips', async ({
    page,
  }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await expect(page.getByRole('link', { name: 'Sign in to fill this in' })).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rumana');
    await expect(page.getByLabel('Mobile number')).toHaveValue('01711223344');
    await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Thana')).toHaveValue(String(THANA.mirpur));
    await expect(page.getByLabel('Full address')).toHaveValue('House 12/B, Road 3, Mirpur 10');

    await page.getByRole('button', { name: 'Office' }).click();
    await expect(page.getByRole('button', { name: 'Office' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByLabel('Thana')).toHaveValue(String(THANA.tejgaon));
    await expect(page.getByLabel('Full address')).toHaveValue('Level 5, Kawran Bazar');
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳770');

    await page.getByRole('button', { name: 'Place order · cash on delivery' }).click();
    await page.waitForURL('**/order/K7F2M9QX');
    expect((await shop.sent()).orders[0]?.body).toMatchObject({
      customerName: 'Rumana',
      phone: '01711223344',
      locationId: THANA.tejgaon,
      deliveryAddress: 'Level 5, Kawran Bazar',
    });
  });

  test('editing what a chip filled in lets the chip go', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await page.getByLabel('Full address').fill('Somewhere else');
    await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('the confirmation offers an account to a guest, not to someone signed in', async ({
    page,
  }) => {
    const shop = await openShop(page, withRumana);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await page.getByRole('button', { name: 'Place order · cash on delivery' }).click();
    await page.waitForURL('**/order/K7F2M9QX');
    const offer = page.getByRole('link', {
      name: 'Make an account to see all your orders in one place',
    });
    await expect(offer).toHaveAttribute('href', '/sign-up');
    await signIn(page, shop);
    await page.goto(shop.url('/order/K7F2M9QX'));
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await expect(offer).toHaveCount(0);
  });

  test("the landing page's confirmation offers none (CUS-07)", async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await page.getByRole('button', { name: 'Confirm order' }).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Make an account/ })).toHaveCount(0);
  });

  test('tracking leads to every order by phone, in the storefront only', async ({ page }) => {
    const on = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
    }));
    await page.goto(on.url('/track/K7F2M9QX'));
    await expect(page.getByRole('link', { name: 'All your orders by phone' })).toHaveAttribute(
      'href',
      '/account',
    );
    const off = await openShop(page, (language) => ({
      storefrontEnabled: false,
      tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
    }));
    await page.goto(off.url('/track/K7F2M9QX'));
    await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All your orders by phone' })).toHaveCount(0);
  });
});

test.describe('the way in', () => {
  test('a storefront switched off has no account (SFT-16)', async ({ page }) => {
    const shop = await openShop(page, () => ({
      storefrontEnabled: false,
      shoppers: [rumana('en')],
    }));
    // Still signed in from before it was switched off: the cookie opens nothing.
    const token = await serverSignIn(shop);
    await page.context().addCookies([{ name: 'lytro-shopper', value: token, url: shop.url('/') }]);
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/account',
      '/account/addresses',
      '/account/profile',
    ]) {
      const answer = await page.goto(shop.url(path));
      expect(answer?.status(), path).toBe(404);
    }
    await page.goto(shop.url('/l/cotton-panjabi'));
    const call = await callFromPage(page, 'POST', '/api/shopper/signin', {
      phone: '01711223344',
      password: RUMANA_PASSWORD,
    });
    expect(call.status).toBe(404);
  });

  test('a closed shop shows nothing of an account (SFT-12)', async ({ page }) => {
    const shop = await openShop(page, () => ({ outcome: 'closed' }));
    await page.goto(shop.url('/account'));
    await expect(page.getByRole('heading', { name: 'Back soon' })).toBeVisible();
  });

  test('only the calls the pages make pass through', async ({ page }) => {
    const shop = await openShop(page, withRumana);
    await signIn(page, shop);
    for (const [method, path] of [
      ['GET', 'me'],
      ['GET', 'addresses'],
      ['POST', 'nothing'],
      ['DELETE', 'addresses/not-an-id'],
      ['DELETE', 'me'],
    ] as const) {
      const answer = await callFromPage(page, method, `/api/shopper/${path}`);
      expect(answer.status, `${method} ${path}`).toBe(404);
    }
  });
});
