import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GADGET, MEHEDI, RAHIM } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §5: every shop, found by name or address, and everything done to one from its page.

async function openShop(page: Page, id = RAHIM, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto(`/shops/${id}`);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  return log;
}

function dialog(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name });
}

function card(page: Page, heading: string) {
  return page
    .getByRole('main')
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: heading, exact: true }),
    });
}

test.describe('the list', () => {
  test('shows each shop, its state, plan and period', async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Shops' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    await expect(main.getByText('rahim-fashion.lytro.app')).toBeVisible();
    await expect(main.getByText('Starter v3').first()).toBeVisible();
    await expect(main.getByText('14 Nov 2026')).toBeVisible();
    await expect(main.getByText('+24d')).toBeVisible();
    await expect(main.getByText('-13d')).toBeVisible();
    await expect(main.getByText('Suspended')).toBeVisible();
    await expect(main.getByText('1 overrides').first()).toBeVisible();
    await expect(main.getByText('Filters by state and plan arrive')).toBeVisible();
  });

  test('searches as you type, and the address keeps the word', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/shops');
    const main = page.getByRole('main');
    await main.getByRole('searchbox').fill(' faiza ');
    await expect(page).toHaveURL('/shops?q=faiza');
    await expect(main.getByRole('link', { name: 'Faiza Shoes' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toHaveCount(0);
    expect(log.calls.at(-1)?.query).toContain('query=faiza');
    await main.getByRole('searchbox').fill('');
    await expect(page).toHaveURL('/shops');
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
  });

  test('says when nothing matches', async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops?q=zxq');
    await expect(page.getByRole('main').getByText('No shops match')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load 20 more' })).toHaveCount(0);
  });

  test('loads more when there are more', async ({ page }) => {
    const log = await mockApi(page);
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...log.state.shops[0],
      id: `many-${String(index)}`,
      shopName: `Shop number ${String(index)}`,
      slug: `shop-${String(index)}`,
    })) as typeof log.state.shops;
    log.state.shops = many;
    await page.goto('/shops');
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Shop number 19', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Shop number 24', exact: true })).toHaveCount(0);
    await main.getByRole('button', { name: 'Load 20 more' }).click();
    await expect(main.getByRole('link', { name: 'Shop number 24', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Load 20 more' })).toHaveCount(0);
  });

  test('opens a shop from its row, its name or its button', async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops');
    const main = page.getByRole('main');
    await main.getByText('rahim-fashion.lytro.app').click();
    await expect(page).toHaveURL(`/shops/${RAHIM}`);
    await page.goBack();
    await main.getByRole('link', { name: 'Faiza Shoes' }).click();
    await expect(page).toHaveURL('/shops/ten-0034');
    await page.goBack();
    await main.getByRole('button', { name: 'Open', exact: true }).first().click();
    await expect(page).toHaveURL(`/shops/${RAHIM}`);
  });

  test('a list that fails offers a retry', async ({ page }) => {
    const log = await mockApi(page, { failing: { '/operator/tenants': 503 } });
    await page.goto('/shops');
    await expect(page.getByText('The server did not answer')).toBeVisible();
    log.state.failing = {};
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
  });
});

test.describe("a shop's page", () => {
  test('opens with its facts', async ({ page }) => {
    await openShop(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Rahim Fashion', level: 1 })).toBeVisible();
    await expect(main.getByRole('link', { name: 'rahim-fashion.lytro.app' })).toHaveAttribute(
      'href',
      'https://rahim-fashion.lytro.app',
    );
    await expect(main.getByText(RAHIM, { exact: true })).toBeVisible();
    await expect(main.getByText('Starter v3')).toBeVisible();
    await expect(main.getByText('14 Nov 2026').first()).toBeVisible();
    await expect(main.getByText('24 days')).toBeVisible();
    await expect(main.getByText('Not suspended')).toBeVisible();
    await expect(main.getByText('Shop detail')).toBeVisible();
    await expect(main.getByText('View as this shop')).toBeVisible();
  });

  test('suspending needs a reason, then says who, when and why', async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Suspend for cause' }).click();
    const panel = dialog(page, 'Suspend Rahim Fashion?');
    await expect(panel.getByText('The storefront and landing pages go offline')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Suspend' })).toBeDisabled();
    await panel.getByLabel('Reason the seller will see').fill('Fake goods');
    await panel.getByRole('button', { name: 'Suspend' }).click();
    await expect(panel).toBeHidden();
    await expect(
      page.getByRole('alert').getByText(/Suspended .* by ops@lytro.app: "Fake goods"/),
    ).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/suspend`)).toEqual({
      reason: 'Fake goods',
    });
  });

  test('restoring shows the reason it lifts, then the storefront is back', async ({ page }) => {
    await openShop(page, GADGET);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    const panel = dialog(page, 'Restore Dhaka Gadget House?');
    await expect(panel.getByText('Counterfeit chargers reported')).toBeVisible();
    await panel.getByRole('button', { name: 'Restore' }).click();
    await expect(
      page.getByRole('status').getByText('Restored. The storefront is back.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspend for cause' })).toBeVisible();
  });

  test('adjusts the balance, up or down, and says what it is now', async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Adjust balance' }).click();
    const panel = dialog(page, 'Adjust balance');
    await expect(panel.getByText('A correction, not a refund.', { exact: false })).toBeVisible();
    await panel.getByLabel('Amount').fill('-150');
    await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Double charge');
    await panel.getByRole('button', { name: 'Apply' }).click();
    await expect(
      page.getByRole('status').getByText('Applied. Balance is now ৳1,350.'),
    ).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/balance-adjust`)).toEqual({
      amount: -150,
      reason: 'Double charge',
    });
  });

  test('a zero adjustment cannot be sent', async ({ page }) => {
    await openShop(page);
    await page.getByRole('button', { name: 'Adjust balance' }).click();
    const panel = dialog(page, 'Adjust balance');
    await panel.getByLabel('Amount').fill('0');
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Nothing');
    await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('assigns a plan, starting from the one it is on', async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Assign a plan' }).click();
    const panel = dialog(page, 'Assign a plan');
    await expect(panel.getByLabel('Plan')).toHaveValue('p-starter');
    await expect(panel.getByRole('option', { name: 'Trial v2 · not for sale' })).toBeAttached();
    await panel.getByLabel('Plan').selectOption('p-growth');
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Agreed by phone');
    await panel.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(
      page.getByRole('status').getByText('Assigned. Rahim Fashion is on Growth.'),
    ).toBeVisible();
    expect(log.sent('POST', '/operator/plans/p-growth/assign')).toEqual({
      tenantId: RAHIM,
      reason: 'Agreed by phone',
    });
  });

  test('sets an override, shown beside the plan value', async ({ page }) => {
    const log = await openShop(page);
    await expect(
      page.getByText("No overrides. The plan's limits apply as they are."),
    ).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Add override' }).first().click();
    const panel = dialog(page, 'Add a limit override');
    await panel.getByLabel('Value').fill('250');
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Migration');
    await panel.getByRole('button', { name: 'Set override' }).click();
    await expect(page.getByRole('status').getByText('Override set.')).toBeVisible();
    const row = card(page, 'Limit overrides');
    await expect(row).toContainText('Products: 250');
    await expect(row).toContainText('plan: 100');
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/limit-overrides`)).toEqual({
      limitKey: 'products',
      value: 250,
      reason: 'Migration',
    });
  });

  test('sets an override to unlimited', async ({ page }) => {
    const log = await openShop(page);
    await card(page, 'Limit overrides').getByRole('button', { name: 'Add override' }).click();
    const panel = dialog(page, 'Add a limit override');
    await panel.getByRole('checkbox', { name: 'Unlimited' }).check();
    await expect(panel.getByLabel('Value')).toBeDisabled();
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Eid');
    await panel.getByRole('button', { name: 'Set override' }).click();
    await expect(card(page, 'Limit overrides')).toContainText('Products: Unlimited');
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/limit-overrides`)).toMatchObject({
      value: null,
    });
  });

  test('the retention period cannot be unlimited', async ({ page }) => {
    await openShop(page);
    await card(page, 'Limit overrides').getByRole('button', { name: 'Add override' }).click();
    const panel = dialog(page, 'Add a limit override');
    await panel.getByRole('combobox').selectOption('activity_retention_days');
    await expect(panel.getByRole('checkbox', { name: 'Unlimited' })).toHaveCount(0);
  });

  test('removing an override asks first, and names what comes back', async ({ page }) => {
    const log = await openShop(page, GADGET);
    const overrides = card(page, 'Limit overrides');
    await expect(overrides).toContainText('Agreed with the owner');
    await expect(overrides).toContainText('ops@lytro.app');
    await overrides.getByRole('button', { name: 'Remove' }).click();
    const panel = dialog(page, 'Remove this override?');
    await expect(panel).toContainText(
      "Products goes back to the plan's value for Dhaka Gadget House.",
    );
    await panel.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status').getByText('Override removed.')).toBeVisible();
    await expect(overrides).not.toContainText('Agreed with the owner');
    expect(log.calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  test('its payment page suspends and restores apart from the shop', async ({ page }) => {
    const log = await openShop(page);
    const payments = card(page, 'Payments');
    await expect(payments.getByText('Taking payments')).toBeVisible();
    await payments.getByRole('button', { name: 'Suspend the page' }).click();
    const suspend = dialog(page, "Suspend Rahim Fashion's payment page?");
    await expect(
      suspend.getByText('The rest of the shop stays open', { exact: false }),
    ).toBeVisible();
    await suspend.getByRole('textbox', { name: 'Reason' }).fill('Asked for a PIN');
    await suspend.getByRole('button', { name: 'Suspend the page' }).click();
    await expect(
      page.getByRole('status').getByText("Rahim Fashion's payment page is suspended."),
    ).toBeVisible();
    await expect(payments.getByText(/Suspended .*: Asked for a PIN/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspend for cause' })).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/payment-page/suspend`)).toEqual({
      reason: 'Asked for a PIN',
    });

    await payments.getByRole('button', { name: 'Restore the page' }).click();
    const restore = dialog(page, "Restore Rahim Fashion's payment page?");
    await expect(restore.getByText('Asked for a PIN')).toBeVisible();
    await restore.getByRole('button', { name: 'Restore' }).click();
    await expect(payments.getByText('Taking payments')).toBeVisible();
  });

  test('the new-shop cap says its kind and takes three choices', async ({ page }) => {
    const log = await openShop(page);
    const payments = card(page, 'Payments');
    await expect(payments).toContainText('As its kind says · ৳20,000 a day for its first 30 days');
    await payments.getByRole('button', { name: 'Change' }).click();
    const panel = dialog(page, 'New-shop cap for Rahim Fashion');
    await expect(panel.getByLabel('As its kind says (off, it is on a plan)')).toBeChecked();
    await panel.getByText('On for this shop').click();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').getByText('New-shop cap saved.')).toBeVisible();
    await expect(payments).toContainText('Set for this shop');
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/new-shop-cap`)).toEqual({ capped: true });

    await payments.getByRole('button', { name: 'Change' }).click();
    await dialog(page, 'New-shop cap for Rahim Fashion').getByText('As its kind says').click();
    await dialog(page, 'New-shop cap for Rahim Fashion')
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(payments).toContainText('As its kind says ·');
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/new-shop-cap`)).toEqual({ capped: null });
  });

  test('a pay-as-you-go shop is capped by its kind', async ({ page }) => {
    await openShop(page, MEHEDI);
    await card(page, 'Payments').getByRole('button', { name: 'Change' }).click();
    await expect(
      dialog(page, 'New-shop cap for Mehedi Books').getByLabel(
        'As its kind says (on, it is pay-as-you-go)',
      ),
    ).toBeChecked();
  });

  test('lists its phones against its limit; a revoked one has no buttons', async ({ page }) => {
    const log = await openShop(page);
    const phones = card(page, 'Listener phones');
    await expect(phones).toContainText('1 of 1');
    await expect(phones).toContainText('Xiaomi Redmi 12 · app 1.0.3');
    await expect(phones).toContainText('2 flags');
    await expect(phones.getByRole('button', { name: 'Revoke' })).toHaveCount(1);
    await phones.getByRole('button', { name: 'Revoke' }).click();
    const panel = dialog(page, 'Revoke Counter phone?');
    // D7-20: Lytro revoking a shop's phone tells the shop.
    await expect(panel).toContainText('The shop is told in its dashboard');
    await panel.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('status').getByText('Counter phone is revoked.')).toBeVisible();
    await expect(phones.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
    expect(log.calls.some((call) => call.path === '/operator/listener-devices/d1/revoke')).toBe(
      true,
    );
  });

  test('blocking an installation needs why, and shows which', async ({ page }) => {
    const log = await openShop(page);
    await card(page, 'Listener phones').getByRole('button', { name: 'Block' }).click();
    const panel = dialog(page, 'Block this app installation?');
    await expect(panel.getByText('inst-7f3a92c1')).toBeVisible();
    await expect(panel).not.toContainText('The owner is told');
    await expect(panel.getByRole('button', { name: 'Block everywhere' })).toBeDisabled();
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Stolen phone');
    await panel.getByRole('button', { name: 'Block everywhere' }).click();
    await expect(page.getByRole('status').getByText('Blocked. 1 phones revoked.')).toBeVisible();
    expect(log.sent('POST', '/operator/listener-installations/block')).toEqual({
      installationId: 'inst-7f3a92c1',
      reason: 'Stolen phone',
    });
  });

  test('its add-ons and packs, and each limit as it is made up', async ({ page }) => {
    await openShop(page);
    const addons = card(page, 'Add-ons');
    await expect(addons).toContainText('Extra 500 products ×1');
    await expect(addons).toContainText('renews with the plan');
    await expect(addons).toContainText('renewal off');
    await expect(addons).toContainText('paid on the payment page');
    await expect(addons).toContainText('৳149/mo');
    await expect(addons).toContainText('6.2 GB left · auto-buy on');
    await expect(addons).toContainText('40,000 left · auto-buy off');
    const limits = card(page, 'Effective limits');
    await expect(limits).toContainText('Products: 600');
    await expect(limits).toContainText('plan 100 · add-ons +500');
    await expect(limits).toContainText('Storage: 2 GB');
    await expect(limits).toContainText('Bandwidth: 50 GB');
  });

  test('its credential log opens on its own page, without a key in sight', async ({ page }) => {
    await openShop(page);
    const payments = card(page, 'Payments');
    await expect(payments).toContainText('Last used 21 Oct, 14:12');
    await payments.getByRole('button', { name: 'Open the log' }).click();
    await expect(page).toHaveURL(`/shops/${RAHIM}/credentials`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Credential log' })).toBeVisible();
    await expect(main.getByText('Completed a payment')).toBeVisible();
    await expect(main.getByText('Failed')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    await main.getByRole('link', { name: 'Rahim Fashion' }).click();
    await expect(page).toHaveURL(`/shops/${RAHIM}`);
  });

  test('a shop with no gateway keys says so', async ({ page }) => {
    await mockApi(page, { credentialUses: [] });
    await page.goto(`/shops/${RAHIM}/credentials`);
    await expect(page.getByText('No uses yet')).toBeVisible();
  });

  test('a shop that is not there says so, and one that fails offers a retry', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/shops/nobody');
    await expect(page.getByText('No shop here')).toBeVisible();
    log.state.failing = { [`/operator/tenants/${RAHIM}`]: 503 };
    await page.goto(`/shops/${RAHIM}`);
    await expect(page.getByText('The server did not answer')).toBeVisible();
    log.state.failing = {};
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Rahim Fashion', level: 1 })).toBeVisible();
  });

  test('on a phone the band goes back up the way you came', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'The band is under 1024 px');
    await mockApi(page);
    await page.goto(`/shops/${RAHIM}/credentials`);
    const band = page.getByRole('banner').filter({ visible: true });
    await expect(band.getByText('Shops')).toBeVisible();
    await band.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(`/shops/${RAHIM}`);
    await band.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL('/shops');
    await expect(band.getByRole('link', { name: 'Back' })).toHaveCount(0);
  });

  test('in Bangla, it is too', async ({ page }) => {
    await openShop(page, RAHIM, { language: 'bn' });
    await expect(page.getByRole('main').getByText('লিমিট ওভাররাইড')).toBeVisible();
    await expect(page.getByRole('main').getByText('লিসেনার ফোন')).toBeVisible();
    await expect(page.getByRole('button', { name: 'সাসপেন্ড করুন', exact: true })).toBeVisible();
  });

  test('has no accessibility problems', async ({ page }) => {
    await openShop(page);
    await expect(page.getByText('Xiaomi Redmi 12', { exact: false })).toBeVisible();
    let found = await new AxeBuilder({ page }).analyze();
    expect(found.violations.map((violation) => violation.id)).toEqual([]);
    await page.goto('/shops');
    await expect(page.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    found = await new AxeBuilder({ page }).analyze();
    expect(found.violations.map((violation) => violation.id)).toEqual([]);
  });
});
