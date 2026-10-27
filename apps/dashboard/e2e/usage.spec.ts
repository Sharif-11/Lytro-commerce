import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GROWTH } from './support/catalogue';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import type { UsageFixture } from './support/usage';

// TENANT-DASHBOARD-DESIGN §7.24, Slice 11.5c: Usage -- every metric against its limit, the one banner for the metric
// nearest its stop, the ways to more room, the auto-buy switches and the day charts. Each test runs on a phone and on a
// desktop (playwright.config.ts).

async function open(page: Page, usage: UsageFixture = {}, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, {
    language: 'en',
    ...state,
    money: { hasEmail: true, ...state.money, usage },
  });
  await page.goto(`/${SLUG}/usage`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function banner(page: Page) {
  return main(page).getByRole('alert');
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

test('shows every metric, the one banner for the worst, and the ways to more room', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText(/^This cycle: \d+ \w{3} to \d+ \w{3}$/)).toBeVisible();
  await expect(banner(page)).toHaveText('Products at 80%: room for 20 more. An email went too.');
  for (const figure of [
    '80 / 100 · total',
    '1 / 2 · total',
    '0.9 GB / 2 GB · total',
    '18.6 GB / 30 GB · resets each cycle',
    '48,210 / 200,000 · resets each cycle',
    '6 / 10 · resets each cycle',
  ]) {
    await expect(main(page).getByText(figure)).toBeVisible();
  }
  // From 80%, the metric's own add-on and the suggested plan, each opening its sheet.
  await expect(
    main(page).getByRole('link', { name: 'the Extra 500 products add-on' }),
  ).toHaveAttribute('href', `/${SLUG}/addons?buy=extra_products`);
  await expect(main(page).getByRole('link', { name: 'the Growth plan' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan?plan=${GROWTH}`,
  );
  await expect(
    main(page).getByRole('switch', { name: 'Buy a 10 GB pack when bandwidth reaches 100%' }),
  ).not.toBeChecked();
  await expect(
    main(page).getByRole('switch', { name: 'Buy a 100,000 pack when requests reach 100%' }),
  ).toBeVisible();
  await expect(main(page).getByText('today · 2.4 GB')).toBeVisible();
  await expect(main(page).getByText('today · 3,600')).toBeVisible();
  await expectAccessible(page);
});

test('dates the run-out from the server, and offers auto-buy, then the pack, as bandwidth nears its allowance', async ({
  page,
}) => {
  await open(page, { used: { products: 70, bandwidth: 24 }, runsOutDays: { bandwidth: 5 } });
  await expect(banner(page)).toContainText(
    'Bandwidth at 80%: 24 GB of 30 GB. At this pace the allowance runs out on',
  );
  await expect(banner(page).getByRole('link', { name: 'Turn on auto-buy' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?pack=bandwidth`,
  );
  await expect(main(page).getByText(/^at this pace, runs out \d+ \w{3}$/)).toBeVisible();

  await page.unrouteAll();
  await open(page, { used: { products: 70, bandwidth: 28.5 }, runsOutDays: { bandwidth: 1 } });
  await expect(banner(page)).toContainText('Bandwidth at 95%: 28.5 GB of 30 GB.');
  await expect(banner(page).getByRole('link', { name: 'Buy 10 GB · ৳30' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?pack=bandwidth`,
  );
  await expect(main(page).getByRole('link', { name: 'a 10 GB pack for ৳30' })).toBeVisible();
});

test('tells of the grace and its SMS past the allowance, and sends a shop whose auto-buy could not pay to top up', async ({
  page,
}) => {
  await open(page, { used: { products: 70, bandwidth: 31 } });
  await expect(banner(page)).toContainText(
    'Bandwidth used up: 31 GB of 30 GB. Images and videos keep showing up to 33 GB',
  );
  await expect(banner(page)).toContainText('An email and a free SMS went too.');
  await expect(banner(page).getByRole('link', { name: '10 GB pack · ৳30' })).toBeVisible();

  await page.unrouteAll();
  await open(page, {
    used: { products: 70, bandwidth: 30.4 },
    autoBuy: { bandwidth: true, failed: true },
  });
  await expect(banner(page)).toContainText(
    'Auto-buy couldn’t buy a pack: the balance was too short.',
  );
  await expect(banner(page).getByRole('link', { name: 'Top up' })).toHaveAttribute(
    'href',
    `/${SLUG}/balance?topup=1`,
  );
  await expect(main(page).getByText('Couldn’t buy: the balance was too short')).toBeVisible();
});

test("names a full total's add-on, and what further free SMS cost", async ({ page }) => {
  await open(page, { used: { products: 70, seats: 2 } });
  await expect(banner(page)).toHaveText(
    'Seats are full: 2 of 2. No one can be added or brought back until there is room. An email went too.One seat · ৳33',
  );
  await expect(banner(page).getByRole('link', { name: 'One seat · ৳33' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?buy=extra_seat`,
  );

  await page.unrouteAll();
  await open(page, { used: { products: 70, essential_sms_monthly: 10 } });
  await expect(banner(page)).toHaveText(
    'Free SMS used: 10 of 10 this month. Further essential SMS cost ৳0.55 each from the balance. An email went too.',
  );
});

test('switches auto-buy, and reads it again', async ({ page }) => {
  const log = await open(page);
  const bandwidth = main(page).getByRole('switch', {
    name: 'Buy a 10 GB pack when bandwidth reaches 100%',
  });
  await bandwidth.click();
  await expect(bandwidth).toBeChecked();
  expect(log.sent('PATCH', '/addons/auto-buy')).toEqual({ bandwidth: true });
});

test('shows staff who may only read the figures, without the owner’s channels or a way to buy', async ({
  page,
}) => {
  await open(
    page,
    { used: { products: 70, seats: 2 } },
    { isOwner: false, permissions: ['payments:read'] },
  );
  await expect(banner(page)).toHaveText(
    'Seats are full: 2 of 2. No one can be added or brought back until there is room.',
  );
  await expect(
    main(page).getByRole('switch', { name: 'Buy a 10 GB pack when bandwidth reaches 100%' }),
  ).toBeDisabled();
});

test("opens the suggested plan's upgrade from “To raise it”", async ({ page }) => {
  await open(page);
  await main(page).getByRole('link', { name: 'the Growth plan' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Upgrade to Growth' }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/plan$`));
});

test('reads in Bangla', async ({ page }) => {
  await mockApi(page, { money: { hasEmail: true } });
  await page.goto(`/${SLUG}/usage`);
  await expect(banner(page)).toHaveText('প্রোডাক্ট 80%: আর 20টার জায়গা আছে। একটা ইমেইলও গেছে।');
  await expectAccessible(page);
});
