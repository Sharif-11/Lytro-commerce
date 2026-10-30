import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnDomain } from './support/domain';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.30, Slice 13 (Part 28): the shop's own domain -- the line on Storefront, adding it with
// what is refused under the field, its records with Copy value, Check now, active as the shop's main address
// everywhere its link shows, the offer and Off for a plan without it, and removing it asked first. Each test runs on a
// phone and on a desktop (playwright.config.ts).

const PAGE = '/settings/storefront/domain';

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
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

test('Storefront has the own-domain line, which opens its page', async ({ page }) => {
  await open(page, '/settings/storefront');
  const line = main(page).getByRole('link', { name: /Your own domain/ });
  await expect(line).toContainText('Not set up · like megh.com');
  await line.click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${PAGE}$`));
  await expect(main(page).getByText('A domain you bought, like megh.com')).toBeVisible();
  await expectAccessible(page);
});

test('adds the domain and shows its records; Check now keeps checking until they are found', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const log = await open(page, PAGE);
  const add = main(page).getByRole('button', { name: 'Add' });
  await expect(add).toBeDisabled();
  await main(page).getByLabel('Your domain').fill('https://Megh.com/');
  await add.click();
  expect(log.sent('POST', '/domain')).toEqual({ hostname: 'https://Megh.com/' });

  await expect(main(page).getByRole('heading', { name: 'megh.com', exact: true })).toBeVisible();
  await expect(main(page).getByText('Waiting for your records')).toBeVisible();
  await expect(
    main(page).getByRole('heading', { name: 'Add these records where you bought the domain' }),
  ).toBeVisible();
  for (const text of ['A', 'TXT', '@', '203.0.113.10', '_lytro', 'lytro=megh', 'CNAME']) {
    await expect(main(page).getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(main(page).getByRole('heading', { name: 'For www.megh.com too' })).toBeVisible();
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Copy value' }).nth(1).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('lytro=megh');
  await expect(main(page).getByRole('button', { name: 'Value copied' })).toHaveCount(1);

  await main(page).getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByRole('status')).toHaveText(
    "Not found yet; we'll keep checking every 10 minutes",
  );
  expect(log.sent('POST', '/domain/check')).toEqual({});
});

test('refuses what is not a domain, and one active on another shop, under the field', async ({
  page,
}) => {
  await open(page, PAGE);
  const field = main(page).getByLabel('Your domain');
  await field.fill('https://megh');
  await main(page).getByRole('button', { name: 'Add' }).click();
  await expect(main(page).getByText('Enter a domain like megh.com.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('rahim.com');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await main(page).getByRole('button', { name: 'Add' }).click();
  await expect(main(page).getByText('This domain is active on another shop.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('once found it is active, and every link of the shop shows it', async ({ page }) => {
  await open(page, PAGE, {
    domain: { allowed: true, domain: drawnDomain('pending'), findsRecords: true },
  });
  await main(page).getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByRole('status')).toHaveText('megh.com is active');
  await expect(main(page).getByText('Active', { exact: true })).toBeVisible();
  await expect(
    main(page).getByText(
      "megh.com is now your shop's main address. megh.lytro.app and www.megh.com lead here too.",
    ),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Check now' })).toHaveCount(0);

  await page.goto(`/${SLUG}/settings/storefront`);
  await expect(main(page).getByText('megh.com', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Open' })).toHaveAttribute(
    'href',
    'https://megh.com',
  );
  await expect(main(page).getByRole('link', { name: /Your own domain/ })).toContainText(
    'megh.com · active',
  );
});

test('an active domain without its twin says only the shop address leads there', async ({
  page,
}) => {
  await open(page, PAGE, {
    domain: { allowed: true, domain: drawnDomain('active', { twinActive: false }) },
  });
  await expect(
    main(page).getByText(
      "megh.com is now your shop's main address. megh.lytro.app leads here too.",
    ),
  ).toBeVisible();
});

test('removing it asks first; Cancel keeps it, Remove leads back to Storefront', async ({
  page,
}) => {
  const log = await open(page, PAGE, { domain: { allowed: true, domain: drawnDomain('active') } });
  await main(page).getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove megh.com?' });
  await expect(dialog).toContainText(
    'Your shop stops answering on megh.com at once; megh.lytro.app keeps working.',
  );
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(log.calls.some((call) => call.method === 'DELETE')).toBe(false);

  await main(page).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/storefront$`));
  await expect(page.getByRole('status')).toHaveText('megh.com removed');
  expect(log.calls.some((call) => call.method === 'DELETE' && call.path === '/domain')).toBe(true);
  await expect(main(page).getByText(`${SLUG}.lytro.app`, { exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Your own domain/ })).toContainText(
    'Not set up',
  );
});

test('a plan without it sees the offer; a kept domain is Off with See plans (TEN-10, DWN-10)', async ({
  page,
}) => {
  await open(page, PAGE, { domain: { allowed: false, domain: null } });
  await expect(main(page).getByText('Your own domain, like megh.com')).toBeVisible();
  await expect(main(page).getByRole('textbox')).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan`,
  );

  await open(page, PAGE, { domain: { allowed: false, domain: drawnDomain('off') } });
  await expect(main(page).getByText('Off', { exact: true })).toBeVisible();
  await expect(
    main(page).getByText("Your plan doesn't include your own domain. It's kept"),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'See plans' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Remove' })).toBeVisible();
});

test('a domain whose record went missing says so, and one not verified asks to check again', async ({
  page,
}) => {
  await open(page, PAGE, {
    domain: { allowed: true, domain: drawnDomain('pending', { lost: true }) },
  });
  await expect(page.getByRole('alert')).toContainText(
    'Your record was missing on two checks in a row, so your shop is on megh.lytro.app until it is back.',
  );
  await open(page, PAGE, { domain: { allowed: true, domain: drawnDomain('failed') } });
  await expect(main(page).getByText("Couldn't verify")).toBeVisible();
  await expect(
    main(page).getByText("We didn't find your records in 3 days.", { exact: false }),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Check now' })).toBeVisible();
});
