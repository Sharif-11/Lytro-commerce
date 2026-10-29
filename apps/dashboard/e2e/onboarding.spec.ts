import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SLUG } from './support/mock-api';
import { BOGURA, mockOnboarding, STARTER, TWELVE_MONTHS, typeCode } from './support/onboarding-api';

// TENANT-DASHBOARD-DESIGN §6, Slice 11.4a: the steps before a shop -- sign-in, the code, create-shop, the checkout,
// a password, set-up -- and the doors beside them (staff, a forgotten password, the shop picker), against a mocked
// API, on a phone and a desktop (playwright.config.ts).

const PHONE = '+8801711234567';

test('walks a new owner from the website to Home: code, shop, checkout, password, set-up', async ({
  page,
}) => {
  const log = await mockOnboarding(page);
  await page.goto(`/sign-in?shop=megh&planId=${STARTER}&termId=${TWELVE_MONTHS}`);
  // What the guest chose on the website, named and promising nothing (decided 2026-10-23).
  await expect(page.getByText('আপনার লিংক: megh.lytro.app')).toBeVisible();
  await expect(page.getByText('প্ল্যান: Starter · 12 মাস')).toBeVisible();

  await page.getByLabel('ফোন নম্বর').fill('1711234567');
  await page.getByRole('button', { name: 'এগিয়ে যান' }).click();
  await expect(
    page.getByText('+880 1711 234 567 নম্বরে 6 সংখ্যার একটি কোড পাঠানো হয়েছে'),
  ).toBeVisible();
  await typeCode(page, '123456');
  await page.getByRole('button', { name: 'ভেরিফাই করুন' }).click();

  // The address brought from the website stays; the name does not overwrite it.
  await expect(page).toHaveURL('/create-shop');
  await page.getByLabel('শপের নাম').fill('Rumana Fashion');
  await expect(page.getByLabel('শপের লিংক')).toHaveValue('megh');
  await expect(page.getByText('লিংকটা ঠিক আছে')).toBeVisible();
  await page.getByLabel('আপনার নাম').fill('রুমানা আক্তার');
  await page.getByRole('button', { name: 'শপ তৈরি করুন' }).click();

  await expect(page).toHaveURL('/checkout');
  await expect(page.getByRole('button', { name: 'Starter' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '12 মাস · 12% ডিসকাউন্ট' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('৳4,741').first()).toBeVisible();
  // The payment request is made on Continue, with the amount shown, never for each chip (BIL-09).
  expect(log.calls.some((call) => call.path === '/billing/quote')).toBe(false);
  await page.getByRole('button', { name: 'কন্টিনিউ করুন · ৳4,741' }).click();
  await expect(page.getByText('01700 000 000')).toBeVisible();
  expect(log.sent('POST', '/billing/quote')).toEqual({
    planId: STARTER,
    billingTermId: TWELVE_MONTHS,
    amount: 4741,
  });
  await page.getByLabel('ট্রানজ্যাকশন আইডি (TrxID)').fill('9F2KQ7X1');
  await page.getByLabel('যে নম্বর থেকে পাঠিয়েছেন').fill('1811223344');
  await page.getByRole('button', { name: 'পেমেন্ট জমা দিন' }).click();
  await expect(page.getByText('পেমেন্ট জমা হয়েছে।', { exact: false })).toBeVisible();
  expect(log.sent('POST', '/billing/purchase')).toEqual({
    paymentId: 'payment-1',
    method: 'wallet',
    transactionId: '9F2KQ7X1',
    senderNumber: '+8801811223344',
    amountPaid: 4741,
  });
  await page.getByRole('button', { name: 'এগিয়ে যান' }).click();

  await expect(page).toHaveURL('/set-password?required=false');
  await page.getByLabel('নতুন পাসওয়ার্ড').fill('megh2026');
  await page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' }).click();

  await expect(page).toHaveURL('/set-up');
  await page.getByRole('button', { name: 'পোশাক' }).click();
  await page.getByRole('button', { name: 'সিটি বা জেলা সার্চ করুন' }).click();
  const sheet = page.getByRole('dialog', { name: 'সিটি বা জেলা সার্চ করুন' });
  await sheet.getByRole('searchbox').fill('বগুড়া');
  await sheet.getByRole('button', { name: 'বগুড়া জেলা' }).click();
  await expect(page.getByRole('button', { name: 'বগুড়া জেলা' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('বগুড়া জেলা-র ভেতরে')).toBeVisible();
  await page.getByRole('button', { name: 'সেভ করে ড্যাশবোর্ডে যান' }).click();

  await expect(page).toHaveURL(`/${SLUG}`);
  expect(log.sent('PUT', '/business-type')).toEqual({ businessType: 'clothing' });
  expect(log.sent('PUT', '/delivery-zones/home-area')).toEqual({
    areas: { cityCodes: [], zillaIds: [BOGURA], locationIds: [] },
  });
});

test('fills the link from the name as it is typed, from Latin letters only, until the owner edits it (AUTH-11)', async ({
  page,
}) => {
  await mockOnboarding(page, { signedIn: true });
  await page.goto('/create-shop');
  const name = page.getByLabel('শপের নাম');
  const link = page.getByLabel('শপের লিংক');
  await name.fill('Megh Fashion');
  await expect(link).toHaveValue('megh-fashion');
  await expect(page.getByText('megh-fashion.lytro.app')).toBeVisible();
  await expect(page.getByText('app.lytro.app/megh-fashion')).toBeVisible();
  // A name in Bangla alone has no Latin letters to fill it from (AUTH-11, decided 2026-10-23).
  await name.fill('মেঘ ফ্যাশন');
  await expect(link).toHaveValue('');
  await link.fill('Megh Shop');
  await expect(link).toHaveValue('megh-shop');
  await name.fill('Something Else');
  await expect(link).toHaveValue('megh-shop');
});

test("says a taken link is taken, and offers the server's next free one", async ({ page }) => {
  await mockOnboarding(page, { signedIn: true, takenAddresses: ['megh'] });
  await page.goto('/create-shop');
  await page.getByLabel('শপের লিংক').fill('megh');
  await expect(page.getByText('এই লিংকটা নেওয়া হয়ে গেছে।')).toBeVisible();
  await page.getByRole('button', { name: 'megh-2' }).click();
  await expect(page.getByLabel('শপের লিংক')).toHaveValue('megh-2');
  await expect(page.getByText('লিংকটা ঠিক আছে')).toBeVisible();
});

test("tells a returning owner the earlier shop's balance comes along, and keeps everything typed when refused", async ({
  page,
}) => {
  const log = await mockOnboarding(page, {
    signedIn: true,
    hasDeletedShop: true,
    refuseShop: true,
  });
  await page.goto('/create-shop');
  await expect(
    page.getByText('আগের শপের ইনভয়েস আর বাকি ব্যালেন্স নতুন শপে চলে আসবে।'),
  ).toBeVisible();
  await page.getByLabel('শপের নাম').fill('Megh Fashion');
  await page.getByLabel('আপনার নাম').fill('রুমানা');
  await expect(page.getByText('লিংকটা ঠিক আছে')).toBeVisible();
  await page.getByRole('button', { name: 'শপ তৈরি করুন' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'কিছু তৈরি হয়নি' })).toBeVisible();
  await expect(page.getByLabel('শপের নাম')).toHaveValue('Megh Fashion');
  await expect(page.getByLabel('আপনার নাম')).toHaveValue('রুমানা');
  expect(log.sent('POST', '/shops')).toEqual({
    ownerName: 'রুমানা',
    shopName: 'Megh Fashion',
    address: 'megh-fashion',
  });
});

test('turns the boxes red on a wrong code, and a password is one tap away with the number kept', async ({
  page,
}) => {
  await mockOnboarding(page, { wrongCode: true });
  await page.goto(
    `/verify-code?phone=${encodeURIComponent(PHONE)}&expiresInSeconds=300&resendAfterSeconds=60`,
  );
  await typeCode(page, '444444');
  await page.getByRole('button', { name: 'ভেরিফাই করুন' }).click();
  await expect(page.getByRole('alert')).toHaveText('ভুল কোড। আর 2 বার চেষ্টা করা যাবে।');
  await expect(page.getByText('5 বার ভুল হয়েছে। 15 মিনিট পর আবার ট্রাই করুন।')).toBeVisible();
  await page.getByRole('link', { name: 'পাসওয়ার্ড দিয়ে লগইন করুন' }).click();
  await expect(page.getByLabel('পাসওয়ার্ড')).toBeVisible();
  await expect(page.getByLabel('ফোন নম্বর')).toHaveValue('1711234567');
});

test('checks the three password rules as they are typed, and holds Save until all pass', async ({
  page,
}) => {
  const log = await mockOnboarding(page, { signedIn: true, hasShop: true });
  await page.goto('/set-password');
  const field = page.getByLabel('নতুন পাসওয়ার্ড');
  const rules = page.getByRole('listitem');
  await field.fill('01711234567');
  // Long enough and has a digit, but it is a phone number.
  await expect(rules.filter({ hasText: 'আপনার ফোন নম্বর নয়' })).not.toHaveClass(/text-success/);
  await page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' }).click();
  await expect(page.getByText('পাসওয়ার্ডটা নিয়মগুলো মানছে না।')).toBeVisible();
  expect(log.sent('POST', '/auth/password')).toBeUndefined();
  await field.fill('megh2026');
  for (const rule of ['8 থেকে 20 অক্ষর', 'অন্তত একটা সংখ্যা', 'আপনার ফোন নম্বর নয়']) {
    await expect(rules.filter({ hasText: rule })).toHaveClass(/text-success/);
  }
  await page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' }).click();
  await expect(page).toHaveURL('/set-up');
  expect(log.sent('POST', '/auth/password')).toEqual({ newPassword: 'megh2026' });
});

test('asks for a new password with no Skip after a reset (AUTH-19)', async ({ page }) => {
  await mockOnboarding(page, { signedIn: true, hasShop: true });
  await page.goto('/set-password?required=true');
  await expect(page.getByRole('heading', { name: 'নতুন পাসওয়ার্ড দিন' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'এখন বাদ দিন' })).toHaveCount(0);
});

test('opens the one shop, or the picker with each shop and role when there are several (TEN-15)', async ({
  page,
}) => {
  await mockOnboarding(page, {
    signedIn: true,
    hasShop: true,
    shops: [
      { slug: SLUG, shopName: 'মেঘ ফ্যাশন', role: 'owner' },
      { slug: 'rahim-gadgets', shopName: 'রহিম গ্যাজেটস', role: 'staff' },
    ],
  });
  await page.goto('/shops');
  await expect(page.getByRole('heading', { name: 'কোন শপে যাবেন?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /রহিম গ্যাজেটস/ })).toContainText(
    'rahim-gadgets.lytro.app · স্টাফ',
  );
  await page.getByRole('link', { name: /মেঘ ফ্যাশন/ }).click();
  await expect(page).toHaveURL(`/${SLUG}`);

  await page.unrouteAll();
  await mockOnboarding(page, { signedIn: true, hasShop: true });
  await page.goto('/shops');
  await expect(page).toHaveURL(`/${SLUG}`);
});

test('shows only the sign-in providers the server has', async ({ page }) => {
  await mockOnboarding(page, { providers: ['google'] });
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'গুগল দিয়ে চালিয়ে যান' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ফেসবুক দিয়ে চালিয়ে যান' })).toHaveCount(0);

  await page.unrouteAll();
  await mockOnboarding(page, { providers: [] });
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'এগিয়ে যান' })).toBeVisible();
  await expect(page.getByText('অথবা', { exact: true })).toHaveCount(0);
});

test("signs a staff member in, has them choose their own password, and opens the owner's shop (AUTH-31)", async ({
  page,
}) => {
  await mockOnboarding(page);
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'স্টাফ? এখানে লগইন করুন' }).click();
  // The owner's page has a phone field too: wait for the staff page before typing, or a slow load types into the old one.
  await expect(page.getByRole('heading', { name: 'স্টাফ লগইন' })).toBeVisible();
  await page.getByLabel('ফোন নম্বর').fill('1811223344');
  await page.getByLabel('পাসওয়ার্ড').fill('owner-set-1');
  await page.getByRole('button', { name: 'লগইন করুন' }).click();
  await expect(page).toHaveURL('/staff-set-password');
  await page.getByLabel('নতুন পাসওয়ার্ড').fill('kamal2026');
  await page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' }).click();
  await expect(page).toHaveURL(`/${SLUG}`);
});

test('passes an accessibility check on the steps', async ({ page }) => {
  for (const [path, journey] of [
    ['/sign-in', {}],
    ['/create-shop', { signedIn: true }],
    [`/checkout`, { signedIn: true, hasShop: true }],
    ['/set-up', { signedIn: true, hasShop: true }],
  ] as const) {
    await mockOnboarding(page, journey);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map(
        (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
    await page.unrouteAll();
  }
});
