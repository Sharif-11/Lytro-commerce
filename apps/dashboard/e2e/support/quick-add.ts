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
  await openQuickMore(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'A different price or SKU per design or size' })
    .click();
}
