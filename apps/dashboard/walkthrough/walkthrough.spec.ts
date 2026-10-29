import { expect, test, type Locator, type Page } from '@playwright/test';
import { codeFor, freshPhone, typeCode } from './support';

// PHASE-3-PLAN Slice 11's "done when" (Slice 11.13b): a seller of clothes, cosmetics or groceries signs up, makes a
// product with its variants, adds stock, counts it with one item short, orders more from a supplier and records its
// arrival, and the stock rises -- on a phone, in Bangla, against the real server. On every screen and sheet the words
// are plain (no inventory jargon, INV-22), and the fields are the shop type's own: a clothing shop never sees an
// expiry, batch or IMEI field, a cosmetics or grocery shop sees the optional batch code and expiry; groceries count
// in kg, with decimals.

interface Preset {
  /** The shop type set-up offers (PST-01) and the shop's name, whose link the server makes. */
  type: string;
  shop: string;
  slug: string;
  product: string;
  price: string;
  /** The suggested attribute that splits it into variants, and their options. */
  attribute: string;
  options: [string, string];
  /** Kept in batches with an expiry (the preset's default, PST-02). */
  batches: boolean;
  /** How much arrives by Add stock, is counted, and is ordered, on the first option. */
  added: string;
  counted: string;
  ordered: string;
  /** What the first option holds at the end: counted, then what arrived; and its unit where not pieces. */
  held: string;
  unit: string;
}

const PRESETS: Preset[] = [
  {
    type: 'পোশাক',
    shop: 'Rumana Fashion',
    slug: 'rumana-fashion',
    product: 'সুতি টি-শার্ট',
    price: '450',
    attribute: 'Size',
    options: ['M', 'L'],
    batches: false,
    added: '10',
    counted: '9',
    ordered: '12',
    held: '21',
    unit: '',
  },
  {
    type: 'কসমেটিক্স',
    shop: 'Nupur Beauty',
    slug: 'nupur-beauty',
    product: 'ম্যাট লিপস্টিক',
    price: '650',
    attribute: 'Shade',
    options: ['Ruby', 'Coral'],
    batches: true,
    added: '10',
    counted: '9',
    ordered: '12',
    held: '21',
    unit: '',
  },
  {
    type: 'মুদি',
    shop: 'Karim Store',
    slug: 'karim-store',
    product: 'মসুর ডাল',
    price: '140',
    attribute: 'Brand',
    options: ['ACI', 'Pran'],
    batches: true,
    added: '12.5',
    counted: '12.25',
    ordered: '25',
    held: '37.25',
    unit: ' কেজি',
  },
];

/**
 * INV-22: the technical words a seller should never meet, in English and in formal Bangla, and a requirement id like
 * PUR-04 (agreed in the 11.13b reads). The vernacular the style guide keeps (স্টক, ইনভেন্টরি, ব্যাচ) is not among them.
 */
const JARGON = [
  /\bSKU\b/i,
  /\bUOM\b/i,
  /\bunit of measure\b/i,
  /\bledger\b/i,
  /\bFIFO\b/i,
  /\bCOGS\b/i,
  /\bvaluation\b/i,
  /\breorder point\b/i,
  /\bbackorder\b/i,
  /\bwarehouse\b/i,
  /\blot number\b/i,
  /মজুদ/,
  /খতিয়ান/,
  /গুদাম/,
  /মূল্যায়ন/,
  /\b[A-Z]{3}-\d{2}\b/,
];

/** The fields a shop that keeps no batches never sees (INV-22), as they are labelled. */
const KEPT_FIELDS = /ব্যাচ কোড|মেয়াদ|IMEI|সিরিয়াল/;

function main(page: Page): Locator {
  return page.getByRole('main');
}

/** Every word the page shows now, the open sheet's included, is plain (INV-22). */
async function expectPlainWords(page: Page): Promise<void> {
  const shown = await page.locator('body').innerText();
  expect(JARGON.filter((word) => word.test(shown)).map(String)).toEqual([]);
}

/** A sheet asks for a batch code and an optional expiry exactly where the shop keeps batches. */
async function expectBatchFields(sheet: Locator, preset: Preset): Promise<void> {
  const fields = sheet.getByRole('textbox', { name: KEPT_FIELDS });
  if (preset.batches) {
    await expect(sheet.getByRole('textbox', { name: /ব্যাচ কোড/ }).first()).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: /মেয়াদ/ }).first()).toBeVisible();
  } else {
    await expect(fields).toHaveCount(0);
  }
}

async function signUp(page: Page, preset: Preset): Promise<void> {
  const phone = freshPhone();
  await page.goto('/sign-in');
  await expectPlainWords(page);
  await page.getByLabel('ফোন নম্বর').fill(phone);
  await page.getByRole('button', { name: 'এগিয়ে যান' }).click();
  await typeCode(page, await codeFor(phone));
  await page.getByRole('button', { name: 'ভেরিফাই করুন' }).click();
  await expect(page).toHaveURL('/create-shop');
  await page.getByLabel('দোকানের নাম').fill(preset.shop);
  await page.getByLabel('আপনার নাম').fill('রুমানা আক্তার');
  await page.getByRole('button', { name: 'দোকান তৈরি করুন' }).click();
  await expect(page).toHaveURL(/\/set-password/);
  await page.getByLabel('নতুন পাসওয়ার্ড').fill('megh2026');
  await page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' }).click();
  await expect(page).toHaveURL('/set-up');
  await expectPlainWords(page);
  await page.getByRole('button', { name: preset.type, exact: true }).click();
  await page.getByRole('button', { name: 'সিটি বা জেলা খুঁজুন' }).click();
  const area = page.getByRole('dialog', { name: 'সিটি বা জেলা খুঁজুন' });
  await area.getByRole('searchbox').fill('ঢাকা');
  await area
    .getByRole('button')
    .filter({ hasText: /^ঢাকা সিটি/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'সেভ করে ড্যাশবোর্ডে যান' }).click();
  await expect(page).toHaveURL(`/${preset.slug}`);
  await expectPlainWords(page);
}

async function makeProduct(page: Page, preset: Preset): Promise<void> {
  await main(page)
    .getByRole('link', { name: 'প্রোডাক্ট' })
    .first()
    .click()
    .catch(() => undefined);
  await page.goto(`/${preset.slug}/products/new`);
  await expect(main(page).getByText(`ডিফল্ট: ${preset.type}`)).toBeVisible();
  await expectPlainWords(page);
  await main(page).getByLabel('নাম', { exact: true }).fill(preset.product);
  await main(page).getByLabel('দাম', { exact: true }).fill(preset.price);
  const card = main(page).getByRole('region', { name: 'অপশন ও ভ্যারিয়েন্ট' });
  await card.getByRole('button', { name: preset.attribute, exact: true }).click();
  const add = page.getByRole('dialog', { name: 'অ্যাট্রিবিউট যোগ করুন' });
  await add.getByRole('radio', { name: /^ভ্যারিয়েন্ট ভাগ করে/ }).click();
  await add.getByRole('button', { name: 'ঠিক আছে' }).click();
  const options = page.getByRole('dialog', { name: `${preset.attribute} · অপশন` });
  for (const value of preset.options) {
    await options.getByLabel('অপশন যোগ', { exact: true }).fill(value);
    await options.getByRole('button', { name: 'বসান' }).click();
    await expect(options.getByText(value, { exact: true })).toBeVisible();
  }
  await options.getByRole('button', { name: 'ঠিক আছে' }).click();
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'সেভ করুন' }).click();
  await expect(page).toHaveURL(`/${preset.slug}/products`);
  await expect(main(page).getByRole('link', { name: new RegExp(preset.product) })).toBeVisible();
}

async function addStock(page: Page, preset: Preset): Promise<void> {
  await page.goto(`/${preset.slug}/stock`);
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'স্টক যোগ', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'স্টক যোগ' })
    .getByRole('button', { name: new RegExp(`^${preset.product}`) })
    .click();
  const stock = page.getByRole('dialog', { name: 'স্টক যোগ করুন' });
  await expect(stock.getByText(`${preset.product} · ${preset.options[0]}`)).toBeVisible();
  await expectPlainWords(page);
  await expectBatchFields(stock, preset);
  await stock.getByLabel('পরিমাণ', { exact: true }).fill(preset.added);
  if (preset.batches) await stock.getByRole('textbox', { name: /ব্যাচ কোড/ }).fill('B-101');
  await stock.getByRole('button', { name: /যোগ করুন$/ }).click();
  await expect(stock).toBeHidden();
}

async function countStock(page: Page, preset: Preset): Promise<void> {
  await main(page).getByRole('link', { name: 'স্টক গুনুন' }).click();
  await main(page).getByRole('link', { name: 'নতুন গণনা' }).first().click();
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'প্রোডাক্ট বা ক্যাটাগরি বাছুন' }).click();
  const what = page.getByRole('dialog', { name: 'কী গুনবেন' });
  await what.getByRole('checkbox', { name: new RegExp(`^${preset.product}`) }).check();
  await expectPlainWords(page);
  // A shop that keeps no batches meets no note about counting them (design v3.15).
  await expect(what.getByText(/ব্যাচ ধরে গোনা হয়/)).toHaveCount(preset.batches ? 1 : 0);
  await what.getByRole('button', { name: /লাইন গুনুন$/ }).click();
  // A product kept in batches is counted batch by batch, each line named by its option and batch (Slice 11.9).
  const line = preset.batches
    ? new RegExp(`^${preset.options[0]} · B-101 .*: গুনে পেলাম$`)
    : new RegExp(`^${preset.product} · ${preset.options[0]}: গুনে পেলাম$`);
  await main(page).getByRole('textbox', { name: line }).fill(preset.counted);
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'গণনা সেভ করুন' }).click();
  await expect(page).toHaveURL(/\/stock\/checks\/(?!new$)[^/]+$/);
  await expectPlainWords(page);
}

async function buyMore(page: Page, preset: Preset): Promise<void> {
  await page.goto(`/${preset.slug}/purchases`);
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'সাপ্লায়ারকে অর্ডার' }).first().click();
  const order = page.getByRole('dialog', { name: 'সাপ্লায়ারকে অর্ডার' });
  await order.getByLabel('সাপ্লায়ার').fill('রহিম ট্রেডার্স');
  await order.getByRole('button', { name: '"রহিম ট্রেডার্স" নতুন সাপ্লায়ার হিসেবে' }).click();
  await order.getByRole('button', { name: 'আইটেম যোগ' }).click();
  const item = page.getByRole('dialog', { name: 'আইটেম যোগ' });
  await item.getByRole('button', { name: new RegExp(`^${preset.product}`) }).click();
  await item.getByRole('checkbox', { name: new RegExp(`^${preset.options[0]} `) }).check();
  await item.getByRole('button', { name: '1টি আইটেম যোগ করুন' }).click();
  await order.getByLabel(`${preset.product} · ${preset.options[0]}: পরিমাণ`).fill(preset.ordered);
  await expectPlainWords(page);
  await order.getByRole('button', { name: 'সাপ্লায়ারকে দিন' }).click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await expectPlainWords(page);
  await main(page).getByRole('button', { name: 'মাল এসেছে' }).click();
  const arrived = page.getByRole('dialog', { name: 'মাল এসেছে' });
  await expectPlainWords(page);
  await expectBatchFields(arrived, preset);
  if (preset.batches) await arrived.getByRole('textbox', { name: /ব্যাচ কোড/ }).fill('B-102');
  await arrived.getByRole('button', { name: 'ডেলিভারি লিখুন' }).click();
  await expect(arrived).toBeHidden();
}

async function expectStockRose(page: Page, preset: Preset): Promise<void> {
  await page.goto(`/${preset.slug}/stock`);
  // A product whose stock is all fine is folded; one with a variant out of stock is open already.
  const folded = main(page).getByRole('button', { name: new RegExp(`^${preset.product}`) });
  if ((await folded.count()) > 0) await folded.click();
  await expect(
    main(page).getByRole('button', {
      name: new RegExp(`^${preset.options[0]} .*হাতে আছে ${preset.held}${preset.unit}$`),
    }),
  ).toBeVisible();
  // The Expiring figure only where the shop keeps batches (design v3.15).
  await expect(main(page).getByRole('link', { name: /^মেয়াদ শেষ হচ্ছে/ })).toHaveCount(
    preset.batches ? 1 : 0,
  );
  await expectPlainWords(page);
}

for (const preset of PRESETS) {
  test(`${preset.type}: signs up, makes a product, adds stock, counts it and buys more, in plain words`, async ({
    page,
  }) => {
    await signUp(page, preset);
    await makeProduct(page, preset);
    await addStock(page, preset);
    await countStock(page, preset);
    await buyMore(page, preset);
    await expectStockRose(page, preset);
  });
}
