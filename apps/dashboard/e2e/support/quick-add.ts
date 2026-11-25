import { expect, type Page } from '@playwright/test';

// Quick add (TENANT-DASHBOARD-DESIGN §7.4b): what a new product's tests share.

/** After a new product's first save (`pq-saved`): its sheet with the landing link; closing it goes to the list. */
export async function closeSaved(page: Page): Promise<void> {
  const saved = page.getByRole('dialog', { name: /Product saved/ });
  await expect(saved).toBeVisible();
  await saved.getByRole('button', { name: 'Close' }).click();
}

/** আরও সেটিংস under the card, opened. */
export async function openQuickMore(page: Page): Promise<void> {
  await page
    .getByRole('main')
    .getByRole('button', { name: /^More settings/ })
    .click();
}

/** The options and the variant table: today's full form, from আরও সেটিংস. */
export async function toFullForm(page: Page): Promise<void> {
  await toFullFormIn(page, 'en');
}

/** The same, in the shop's language: আরও সেটিংস, then "ডিজাইন বা সাইজভেদে আলাদা দাম, SKU". */
export async function toFullFormIn(page: Page, language: 'bn' | 'en'): Promise<void> {
  const main = page.getByRole('main');
  const bn = language === 'bn';
  await main.getByRole('button', { name: bn ? /^আরও সেটিংস/ : /^More settings/ }).click();
  await main
    .getByRole('button', {
      name: bn
        ? 'ডিজাইন বা সাইজভেদে আলাদা দাম, SKU'
        : 'A different price or SKU per design or size',
    })
    .click();
}

/**
 * A new product made a combo: quick add's "Making a combo pack?" link (§7.4b), or the full form's kind radio where the
 * full form opens (a shop type that keeps batches or serials). Either way the combo's form follows.
 */
export async function startComboKind(page: Page, link: string, kind: string): Promise<void> {
  const main = page.getByRole('main');
  const quick = main.getByRole('button', { name: link });
  const radio = main.getByRole('radio', { name: kind });
  await quick.or(radio).first().waitFor();
  if (await quick.isVisible()) await quick.click();
  else await radio.click();
}
