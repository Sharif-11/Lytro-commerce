import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BILLING_STAFF } from './support/menu';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import {
  DRAWN_HELP_LINE,
  DRAWN_REQUEST_ID,
  NIGHT_IN_DHAKA,
  NOON_IN_DHAKA,
  serverFault,
} from './support/p88-help-mock';

// Slice 8.8 (TENANT-DASHBOARD-DESIGN §7.41, Part 39): Lytro's help line in the Menu, from GET /help-line (D8-4, D8-67 to
// D8-69), and a server fault's error ID wherever a request's failure shows (API-27, D8-21). Each test runs on a phone and
// a desktop (playwright.config.ts).

async function at(page: Page, moment: Date): Promise<void> {
  await page.clock.setFixedTime(moment);
}

async function openMenu(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, state);
  await page.goto(`/${SLUG}/menu`);
  await expect(page.getByRole('heading', { name: 'মেনু' })).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const helpRow = (page: Page) => main(page).getByRole('button', { name: /^হেল্প/ });

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

/** The message WhatsApp opens holding, from a link's `text`. */
function textOf(href: string | null): string {
  return new URL(href ?? '').searchParams.get('text') ?? '';
}

test.describe('the help line (D8-4, D8-67 to D8-69)', () => {
  test('Help opens Lytro support: the hours, open now, WhatsApp with the shop’s address, and Call', async ({
    page,
  }) => {
    await at(page, NOON_IN_DHAKA);
    await openMenu(page);
    await expect(helpRow(page)).toContainText('WhatsApp বা কল · এখন খোলা');
    await helpRow(page).click();
    const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
    await expect(sheet.getByText('প্রতিদিন সকাল 9টা থেকে রাত 10টা')).toBeVisible();
    await expect(sheet.getByText('এখন খোলা')).toBeVisible();
    const whatsapp = sheet.getByRole('link', { name: /WhatsApp-এ মেসেজ দিন/ });
    const href = await whatsapp.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    expect(textOf(href)).toBe('হ্যালো Lytro, আমার শপ megh.lytro.app।');
    await expect(whatsapp).toHaveAttribute('target', '_blank');
    await expect(sheet.getByRole('link', { name: /কল করুন/ })).toHaveAttribute(
      'href',
      'tel:+8801712345678',
    );
    await expect(sheet.getByText('01712 345 678')).toBeVisible();
    await expect(sheet.getByText('হ্যালো Lytro, আমার শপ megh.lytro.app।')).toBeVisible();
    await expectAccessible(page);
  });

  test('closed by Dhaka’s clock, it says when it opens, and both ways stay (p88-help-closed)', async ({
    page,
  }) => {
    await at(page, NIGHT_IN_DHAKA);
    await openMenu(page);
    await expect(helpRow(page)).toContainText('WhatsApp বা কল · সকাল 9টায় খুলবে');
    await helpRow(page).click();
    const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
    await expect(sheet.getByText('এখন বন্ধ')).toBeVisible();
    await expect(
      sheet.getByText('সকাল 9টায় খুলবে। WhatsApp-এ লিখে রাখুন, খোলার পর উত্তর দেব।'),
    ).toBeVisible();
    await expect(sheet.getByRole('link', { name: /WhatsApp-এ মেসেজ দিন/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /কল করুন/ })).toBeVisible();
  });

  test('shows the hours the console sets, in English too', async ({ page }) => {
    await at(page, new Date('2026-11-10T07:30:00+06:00'));
    await openMenu(page, { helpLine: { ...DRAWN_HELP_LINE, opensHour: 8, closesHour: 13 } });
    await main(page).getByRole('button', { name: /^ভাষা/ }).click();
    await expect(main(page).getByRole('button', { name: /^Help/ })).toContainText(
      'WhatsApp or call · opens at 8 am',
    );
    await main(page).getByRole('button', { name: /^Help/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lytro support' });
    await expect(sheet.getByText('Every day, 8 am to 1 pm')).toBeVisible();
    await expect(sheet.getByText('Closed now')).toBeVisible();
    expect(
      textOf(await sheet.getByRole('link', { name: /Message on WhatsApp/ }).getAttribute('href')),
    ).toBe('Hello Lytro, this is megh.lytro.app.');
  });

  test('a number not set is not shown, its row with it (p88-help-wa, p88-help-phone)', async ({
    page,
  }) => {
    await at(page, NOON_IN_DHAKA);
    await openMenu(page, { helpLine: { ...DRAWN_HELP_LINE, phone: null } });
    await expect(helpRow(page)).toContainText('WhatsApp · এখন খোলা');
    await helpRow(page).click();
    const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
    await expect(sheet.getByRole('link', { name: /WhatsApp-এ মেসেজ দিন/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /কল করুন/ })).toHaveCount(0);
  });

  test('with only a phone, Help offers Call and no WhatsApp message', async ({ page }) => {
    await at(page, NOON_IN_DHAKA);
    await openMenu(page, { helpLine: { ...DRAWN_HELP_LINE, whatsapp: null } });
    await expect(helpRow(page)).toContainText('কল · এখন খোলা');
    await helpRow(page).click();
    const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
    await expect(sheet.getByRole('link', { name: /কল করুন/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0);
    await expect(sheet.getByText('WhatsApp-এ মেসেজ এভাবে শুরু হবে')).toHaveCount(0);
  });

  test('with neither number set, there is no Help row (p88-menu-nohelp)', async ({ page }) => {
    await openMenu(page, { helpLine: { ...DRAWN_HELP_LINE, whatsapp: null, phone: null } });
    await expect(main(page).getByRole('button', { name: /^ভাষা/ })).toBeVisible();
    await expect(helpRow(page)).toHaveCount(0);
  });

  test('everyone on the team sees it (p88-menu-staff)', async ({ page }) => {
    await at(page, NOON_IN_DHAKA);
    await openMenu(page, BILLING_STAFF);
    await expect(helpRow(page)).toContainText('WhatsApp বা কল · এখন খোলা');
  });
});

test.describe('the error ID on a server fault (API-27, D8-21)', () => {
  const productsDown = (): ShopState => ({ faults: [serverFault('GET', /^\/products$/, 'bn')] });

  test('a list that didn’t load says so with Try again and the ID, which copies (p88-err-load)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const state = productsDown();
    await mockApi(page, state);
    await page.goto(`/${SLUG}/products`);
    const card = main(page).getByRole('alert');
    await expect(card).toContainText('প্রোডাক্ট লোড হয়নি', { timeout: 20_000 });
    await expect(card).toContainText('কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার ট্রাই করুন।');
    await expect(card).toContainText(DRAWN_REQUEST_ID);
    await expectAccessible(page);
    await card.getByRole('button', { name: 'কপি' }).click();
    await expect(page.getByText('এরর আইডি কপি হয়েছে')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DRAWN_REQUEST_ID);
    // The server answers again: Try again loads the list.
    state.faults?.splice(0);
    await card.getByRole('button', { name: 'আবার ট্রাই করুন' }).click();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
    await expect(main(page).getByRole('searchbox')).toBeVisible();
  });

  test('Send on WhatsApp opens the help line holding the shop’s address and the ID (p88-help-id)', async ({
    page,
  }) => {
    await at(page, NOON_IN_DHAKA);
    await mockApi(page, productsDown());
    await page.goto(`/${SLUG}/products`);
    await main(page).getByRole('button', { name: 'WhatsApp-এ পাঠান' }).click({ timeout: 20_000 });
    const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
    const said = 'হ্যালো Lytro, আমার শপ megh.lytro.app। এরর আইডি: K7MQ-4XR2';
    await expect(sheet.getByText(said)).toBeVisible();
    expect(
      textOf(await sheet.getByRole('link', { name: /WhatsApp-এ মেসেজ দিন/ }).getAttribute('href')),
    ).toBe(said);
  });

  test('with no WhatsApp set, the ID is there to copy alone', async ({ page }) => {
    await mockApi(page, { ...productsDown(), helpLine: { ...DRAWN_HELP_LINE, whatsapp: null } });
    await page.goto(`/${SLUG}/products`);
    const card = main(page).getByRole('alert');
    await expect(card).toContainText(DRAWN_REQUEST_ID, { timeout: 20_000 });
    await expect(card.getByRole('button', { name: 'কপি' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'WhatsApp-এ পাঠান' })).toHaveCount(0);
  });

  test('a Save the server failed shows its sentence and ID above the page (p88-err-save, p88-err-busy)', async ({
    page,
  }) => {
    for (const status of [500, 503]) {
      await mockApi(page, { faults: [serverFault('PATCH', /^\/products\/p-1$/, 'bn', status)] });
      await page.goto(`/${SLUG}/products/p-1`);
      await main(page).getByLabel('নাম', { exact: true }).fill('কটন টি-শার্ট নতুন');
      await page.getByRole('button', { name: 'সেভ করুন' }).first().click();
      const alert = main(page).getByRole('alert').first();
      await expect(alert).toContainText(
        status === 503
          ? 'এই মুহূর্তে ছবির স্টোরেজে পৌঁছানো যাচ্ছে না।'
          : 'কিছু একটা সমস্যা হয়েছে।',
      );
      await expect(main(page).getByText(DRAWN_REQUEST_ID)).toBeVisible();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('a refusal keeps its sentence alone, with no ID (p88-err-refused)', async ({ page }) => {
    await mockApi(page, {
      faults: [
        {
          method: 'PATCH',
          path: /^\/products\/p-1$/,
          status: 409,
          code: 'conflict',
          message: 'অন্য একটি প্রোডাক্ট এই লিংক ব্যবহার করছে। অন্য একটি বেছে নিন।',
          // The server sends an ID with every answer; a refusal is the person's to fix, so none is shown.
          requestId: DRAWN_REQUEST_ID,
        },
      ],
    });
    await page.goto(`/${SLUG}/products/p-1`);
    await main(page).getByLabel('নাম', { exact: true }).fill('কটন টি-শার্ট নতুন');
    await page.getByRole('button', { name: 'সেভ করুন' }).first().click();
    await expect(main(page).getByRole('alert').first()).toContainText(
      'অন্য একটি প্রোডাক্ট এই লিংক ব্যবহার করছে।',
    );
    await expect(main(page).getByText(DRAWN_REQUEST_ID)).toHaveCount(0);
    await expect(main(page).getByText('এরর আইডি')).toHaveCount(0);
  });

  test('inside a sheet, the ID sits above its button (p88-err-sheet)', async ({ page }) => {
    await mockApi(page, { faults: [serverFault('POST', /^\/orders\/o-44\/payments$/, 'bn')] });
    await page.goto(`/${SLUG}/orders/o-44`);
    await page.getByRole('button', { name: 'পেমেন্ট রেকর্ড করুন' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'ক্যাশ' }).click();
    await sheet.getByLabel('টাকা').fill('500');
    await sheet.getByRole('button', { name: 'সেভ করুন' }).click();
    await expect(sheet.getByRole('alert')).toContainText('কিছু একটা সমস্যা হয়েছে।');
    await expect(sheet.getByText(DRAWN_REQUEST_ID)).toBeVisible();
    // The sheet stays open, with what was typed, to try again.
    await expect(sheet.getByLabel('টাকা')).toHaveValue('500');
  });
});
