import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { RAHIM } from './support/console-data';
import { DHAKA, removedCouriers, retiringCouriers, THANAS } from './support/courier-mock';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §10b and §5 (v4), Phase 6 Slice 6.7: the couriers shops can connect, retiring, undoing and removing
// one (CRR-23 to CRR-25, Slice 6.6's read), RedX's areas placed in thanas (CUS-10), and a shop's courier key log (SEC-11).

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

async function couriers(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/couriers');
  await expect(row(page, 'Steadfast')).toBeVisible();
  return log;
}

async function areas(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/couriers/redx-areas');
  await expect(main(page).getByText('Kakoli(Banani)')).toBeVisible();
  return log;
}

test.describe('the couriers', () => {
  test('lists each courier with its state and how many shops lean on it', async ({ page }) => {
    await couriers(page);
    await expect(row(page, 'Steadfast')).toContainText('steadfast');
    await expect(row(page, 'Steadfast')).toContainText('Active');
    await expect(row(page, 'Steadfast')).toContainText('212');
    await expect(row(page, 'Steadfast')).toContainText('180');
    await expect(row(page, 'Steadfast')).toContainText('1,342');
    await expect(main(page).getByRole('button', { name: 'Retire' })).toHaveCount(3);
    await expect(main(page).getByText('is retiring.')).toHaveCount(0);
  });

  test('a retiring courier says since when and what it suggests, with Undo and Remove', async ({
    page,
  }) => {
    await couriers(page, { couriers: retiringCouriers() });
    await expect(
      main(page).getByText(
        'RedX is retiring. Shops already connected keep booking with it; no new shop can connect it.',
      ),
    ).toBeVisible();
    await expect(row(page, 'RedX')).toContainText('Retiring since 19 Oct 2026 · suggests Pathao');
    await expect(row(page, 'RedX').getByRole('button', { name: 'Undo retiring' })).toBeVisible();
    await expect(row(page, 'RedX').getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(row(page, 'RedX').getByRole('button', { name: 'Retire' })).toHaveCount(0);
  });

  test('a removed courier stays, faded, with no action', async ({ page }) => {
    await couriers(page, { couriers: removedCouriers() });
    await expect(row(page, 'RedX')).toContainText(
      'Removed 18 Nov 2026. Past parcels and orders keep its name.',
    );
    await expect(row(page, 'RedX')).toHaveClass(/text-fg-muted/);
    await expect(row(page, 'RedX').getByRole('button')).toHaveCount(0);
  });

  test('retiring suggests only another active courier, needs a reason, and says who was told', async ({
    page,
  }) => {
    const log = await couriers(page, {
      couriers: retiringCouriers().map((each) =>
        each.key === 'redx' ? each : { ...each, state: 'active' as const },
      ),
    });
    await row(page, 'Pathao').getByRole('button', { name: 'Retire' }).click();
    const panel = page.getByRole('dialog', { name: 'Retire Pathao?' });
    await expect(panel.getByText('64 shops are connected to it')).toBeVisible();
    // RedX is retiring, so only Steadfast can be suggested.
    await expect(panel.getByLabel('Suggest instead').locator('option')).toHaveText(['Steadfast']);
    await expect(panel.getByText('64 shops are told')).toBeVisible();
    await expect(panel.getByText('that Steadfast is suggested')).toBeVisible();
    await expect(panel.getByText('21 shops have it as their default.')).toBeVisible();
    const button = panel.getByRole('button', { name: 'Retire Pathao' });
    await expect(button).toBeDisabled();
    await panel.getByLabel('Reason').fill('  Its API stopped answering  ');
    await button.click();
    await expect(page.getByText('Pathao is retiring. 64 shops were told.')).toBeVisible();
    expect(log.sent('POST', '/operator/couriers/pathao/retire')).toEqual({
      suggestedKey: 'steadfast',
      reason: 'Its API stopped answering',
    });
    await expect(row(page, 'Pathao')).toContainText('Retiring');
  });

  test('undoing says the defaults that moved stay, and sends the reason', async ({ page }) => {
    const log = await couriers(page, { couriers: retiringCouriers() });
    await row(page, 'RedX').getByRole('button', { name: 'Undo retiring' }).click();
    const panel = page.getByRole('dialog', { name: 'Undo retiring RedX?' });
    await expect(
      panel.getByText(
        "RedX can be connected again. The 17 shops told it was retiring hear it's back. Defaults that moved stay where they are.",
      ),
    ).toBeVisible();
    await panel.getByLabel('Reason').fill('RedX answers again');
    await panel.getByRole('button', { name: 'Undo retiring' }).click();
    await expect(page.getByText('RedX is active again. 17 shops were told.')).toBeVisible();
    expect(log.sent('POST', '/operator/couriers/redx/undo-retire')).toEqual({
      reason: 'RedX answers again',
    });
  });

  test('Remove lists every order still waiting on it, why, and offers only Close', async ({
    page,
  }) => {
    const log = await couriers(page, { couriers: retiringCouriers() });
    await row(page, 'RedX').getByRole('button', { name: 'Remove' }).click();
    const panel = page.getByRole('dialog', { name: "RedX can't be removed yet" });
    await expect(panel.getByText('4 orders in 3 shops still wait on it')).toBeVisible();
    const order = (number: string) => panel.locator('li').filter({ hasText: number });
    await expect(order('#261019-0042')).toContainText('Rahim Fashion');
    await expect(order('#261019-0042')).toContainText('On its way · delivery-in-progress');
    await expect(order('#261020-0007')).toContainText('On its way · agent-hold');
    await expect(order('#261018-0031')).toContainText(
      'Delivered 18 Oct 2026, its payout not in yet · Stops waiting 17 Nov 2026',
    );
    await expect(order('#261018-0031')).toContainText('Stops waiting 17 Nov 2026');
    await expect(order('#261021-0003')).toContainText("Its booking isn't settled");
    await expect(panel.getByLabel('Reason')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Close' }).last().click();
    await expect(panel).toBeHidden();
    expect(log.calls.some((call) => call.path === '/operator/couriers/redx/remove')).toBe(false);
  });

  test('once nothing waits, Remove deletes it for good with a reason', async ({ page }) => {
    const log = await couriers(page, { couriers: retiringCouriers(0), blocking: [] });
    await row(page, 'RedX').getByRole('button', { name: 'Remove' }).click();
    const panel = page.getByRole('dialog', { name: 'Remove RedX for good?' });
    await expect(panel.getByText("It can't be undone.")).toBeVisible();
    await panel.getByLabel('Reason').fill('Nothing waits on it');
    await panel.getByRole('button', { name: 'Remove RedX' }).click();
    await expect(
      page.getByText('RedX is removed. A developer can now delete its code.'),
    ).toBeVisible();
    expect(log.sent('POST', '/operator/couriers/redx/remove')).toEqual({
      reason: 'Nothing waits on it',
    });
    await expect(row(page, 'RedX')).toContainText('Removed');
  });

  test('a parcel with no status or finish day yet still says why it waits', async ({ page }) => {
    const order = (orderNumber: string, reason: string, waitsUntil: string | null) => ({
      tenantId: 'ten-mim',
      shopName: 'Mim Bakery',
      slug: 'mim-bakery',
      orderId: `ord-${orderNumber}`,
      orderNumber,
      reason,
      courierStatus: null,
      finishedAt: null,
      waitsUntil,
    });
    await couriers(page, {
      couriers: retiringCouriers(),
      blocking: [
        order('261021-0101', 'on_its_way', null),
        order('261021-0102', 'awaiting_payout', '2026-11-17T00:00:00+06:00'),
      ],
    });
    await row(page, 'RedX').getByRole('button', { name: 'Remove' }).click();
    const panel = page.getByRole('dialog', { name: "RedX can't be removed yet" });
    const line = (number: string) => panel.locator('li').filter({ hasText: number });
    await expect(line('#261021-0101')).toHaveText('#261021-0101 · Mim BakeryOn its way');
    await expect(line('#261021-0102')).toContainText(
      'Delivered, its payout not in yet · Stops waiting 17 Nov 2026',
    );
  });

  test('a removal refused because something started waiting shows the list again', async ({
    page,
  }) => {
    const log = await couriers(page, { couriers: retiringCouriers(0), blocking: [] });
    await row(page, 'RedX').getByRole('button', { name: 'Remove' }).click();
    const panel = page.getByRole('dialog', { name: 'Remove RedX for good?' });
    await panel.getByLabel('Reason').fill('Nothing waits on it');
    log.state.blocking = [
      {
        tenantId: 'ten-mim',
        shopName: 'Mim Bakery',
        slug: 'mim-bakery',
        orderId: 'ord-1',
        orderNumber: '261021-0099',
        reason: 'not_settled',
        courierStatus: null,
        finishedAt: null,
        waitsUntil: null,
      },
    ];
    await panel.getByRole('button', { name: 'Remove RedX' }).click();
    const blocked = page.getByRole('dialog', { name: "RedX can't be removed yet" });
    await expect(blocked.getByText('1 order in 1 shop still waits on it')).toBeVisible();
    await expect(blocked.getByText('#261021-0099')).toBeVisible();
  });

  test('a failed read says nothing changed and can be tried again', async ({ page }) => {
    const log = await mockApi(page, { failing: { '/operator/couriers': 503 } });
    await page.goto('/couriers');
    await expect(main(page).getByText('The server did not answer')).toBeVisible();
    delete log.state.failing['/operator/couriers'];
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect(row(page, 'Steadfast')).toBeVisible();
  });

  test('is in Platform, and reads in Bangla with no accessibility fault', async ({ page }) => {
    await couriers(page, { language: 'bn', couriers: retiringCouriers() });
    await expect(main(page).getByRole('heading', { name: 'কুরিয়ার' })).toBeVisible();
    await expect(row(page, 'RedX')).toContainText('থেকে রিটায়ারিং · সাজেস্ট: Pathao');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await row(page, 'RedX').getByRole('button', { name: 'রিটায়ার বাতিল' }).click();
    const inPanel = await new AxeBuilder({ page }).analyze();
    expect(inPanel.violations).toEqual([]);
  });
});

test.describe("RedX's areas", () => {
  test('opens on the suggestions with each filter counted and when the list was read', async ({
    page,
  }) => {
    await areas(page);
    await expect(main(page).getByText('2,866 areas · read 19 Oct, 03:00')).toBeVisible();
    const chip = (name: string) => main(page).getByRole('button', { name: new RegExp(`^${name}`) });
    await expect(chip('Suggested')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip('Suggested')).toContainText('1,100');
    await expect(chip('No thana')).toContainText('973');
    await expect(row(page, 'Kakoli(Banani)')).toContainText('Suggested: Banani');
    await expect(row(page, 'Kakoli(Banani)')).toContainText('1173');
    await expect(main(page).getByText('Notun Bazar')).toHaveCount(0);
    await expect(main(page).getByText('Page 1 of 22')).toBeVisible();
  });

  test('picking suggestions confirms them together in their suggested thanas', async ({ page }) => {
    const log = await areas(page);
    await expect(main(page).getByRole('button', { name: 'Confirm 0' })).toBeDisabled();
    await main(page).getByRole('checkbox', { name: 'Kakoli(Banani)' }).check();
    await main(page).getByRole('checkbox', { name: 'Banasree(Rampura)' }).check();
    await expect(main(page).getByText('2 selected')).toBeVisible();
    await main(page).getByRole('button', { name: 'Confirm 2' }).click();
    const panel = page.getByRole('dialog', { name: 'Confirm 2 suggested areas?' });
    await expect(panel.getByText('Kakoli(Banani) · Banasree(Rampura)')).toBeVisible();
    await panel.getByRole('button', { name: 'Confirm 2' }).click();
    await expect(page.getByText('2 areas confirmed.')).toBeVisible();
    expect(log.sent('POST', '/operator/courier-areas/confirm')).toEqual({
      ids: ['area-1173', 'area-1188'],
    });
    await expect(main(page).getByText('0 selected')).toBeVisible();
  });

  test('the other filters, a name and a district narrow the list from its first page', async ({
    page,
  }) => {
    const log = await areas(page);
    await main(page)
      .getByRole('button', { name: /^In a thana/ })
      .click();
    await expect(row(page, 'Bashundhara R/A')).toContainText('Vatara');
    await expect(row(page, 'Bashundhara R/A')).toContainText('Placed by you');
    await expect(main(page).getByRole('checkbox')).toHaveCount(0);
    await main(page)
      .getByRole('button', { name: /^Retired by RedX/ })
      .click();
    await expect(row(page, 'Old Kalabagan')).toContainText(
      "Gone from RedX's list 12 Oct 2026. Old parcels still show it.",
    );
    await expect(row(page, 'Old Kalabagan').getByRole('button')).toHaveCount(0);
    await main(page).getByRole('button', { name: /^All/ }).click();
    await main(page).getByLabel('District').selectOption({ label: 'Chattogram' });
    await expect(row(page, 'Agrabad')).toBeVisible();
    await expect(main(page).getByText('Mirpur 10')).toHaveCount(0);
    await main(page).getByLabel('District').selectOption({ label: 'All districts' });
    await main(page).getByRole('searchbox', { name: 'Area name' }).fill('gulshan');
    await expect(row(page, 'Gulshan 1')).toBeVisible();
    await expect(main(page).getByText('Mirpur 10')).toHaveCount(0);
    const last = [...log.calls].reverse().find((call) => call.path === '/operator/courier-areas');
    expect(new URLSearchParams(last?.query).get('q')).toBe('gulshan');
    expect(new URLSearchParams(last?.query).get('page')).toBe('1');
    await main(page).getByRole('searchbox', { name: 'Area name' }).fill('no such area');
    await expect(main(page).getByText('No areas here')).toBeVisible();
  });

  test('placing an area in a thana names the thana and its district first', async ({ page }) => {
    const log = await areas(page);
    await main(page)
      .getByRole('button', { name: /^No thana/ })
      .click();
    await row(page, 'Notun Bazar').getByRole('button', { name: 'Place' }).click();
    const panel = page.getByRole('dialog', { name: 'Place Notun Bazar in a thana' });
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();
    await panel.getByRole('searchbox', { name: 'Find a thana' }).fill('badd');
    await panel.getByRole('option', { name: /Badda/ }).click();
    await expect(
      panel.getByText(
        "Staff booking an order in Badda see it among the thana's areas. Its district becomes Dhaka, the thana's.",
      ),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Notun Bazar is in Badda.')).toBeVisible();
    expect(log.sent('PUT', '/operator/courier-areas/area-1301')).toEqual({ thanaId: THANAS.badda });
  });

  test('an area already in a thana can move or come off it', async ({ page }) => {
    const log = await areas(page);
    await main(page)
      .getByRole('button', { name: /^In a thana/ })
      .click();
    await row(page, 'Bashundhara R/A').getByRole('button', { name: 'Change' }).click();
    const panel = page.getByRole('dialog', { name: 'Place Bashundhara R/A in a thana' });
    await expect(panel.getByText('Now: Vatara')).toBeVisible();
    await expect(panel.getByRole('option', { name: /Vatara/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await panel.getByRole('button', { name: 'Take it off the thana' }).click();
    await expect(page.getByText('Bashundhara R/A is off its thana.')).toBeVisible();
    expect(log.sent('PUT', '/operator/courier-areas/area-1290')).toEqual({ thanaId: null });
  });

  test('Refresh now reads the list again and says what changed', async ({ page }) => {
    const log = await areas(page);
    await main(page).getByRole('button', { name: 'Refresh now' }).click();
    await expect(
      page.getByText("RedX's areas read again: 2,866 listed, 4 new, 1 renamed, 2 retired, 0 back."),
    ).toBeVisible();
    expect(log.sent('POST', '/operator/courier-areas/refresh')).toEqual({ courierKey: 'redx' });
  });

  test("without Lytro's token it says so, and Refresh waits for it", async ({ page }) => {
    await mockApi(page, {
      areaToken: false,
      areas: [],
      areasRead: null,
      areaCounts: { all: 0, suggested: 0, unassigned: 0, assigned: 0, retired: 0 },
    });
    await page.goto('/couriers/redx-areas');
    await expect(main(page).getByText('REDX_AREAS_TOKEN')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Refresh now' })).toBeDisabled();
    await expect(main(page).getByText('No areas read yet')).toBeVisible();
    await expect(main(page).getByText('Set the token, then refresh.')).toBeVisible();
  });

  test('reads in Bangla, districts and thanas included, with no accessibility fault', async ({
    page,
  }) => {
    await areas(page, { language: 'bn' });
    await expect(row(page, 'Kakoli(Banani)')).toContainText('সাজেস্ট: বনানী');
    await expect(row(page, 'Kakoli(Banani)')).toContainText('ঢাকা');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await main(page).getByRole('checkbox', { name: 'Kakoli(Banani)' }).check();
    await main(page)
      .getByRole('button', { name: /কনফার্ম করুন/ })
      .click();
    const inPanel = await new AxeBuilder({ page }).analyze();
    expect(inPanel.violations).toEqual([]);
  });

  test('a zilla in the district list is the one the area query filters by', async ({ page }) => {
    const log = await areas(page);
    await main(page).getByLabel('District').selectOption({ label: 'Dhaka' });
    await expect(row(page, 'Kakoli(Banani)')).toBeVisible();
    const last = [...log.calls].reverse().find((call) => call.path === '/operator/courier-areas');
    expect(new URLSearchParams(last?.query).get('zillaId')).toBe(String(DHAKA));
  });
});

test.describe("a shop's courier key log", () => {
  test('the shop page says when its courier keys were last used and opens the log', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/shops/${RAHIM}`);
    const card = main(page).locator('section').filter({ hasText: 'Courier key log' });
    await expect(card).toContainText(
      "Every call Lytro made with this shop's courier keys, never the keys themselves. Last used 21 Oct, 14:12",
    );
    await card.getByRole('button', { name: 'Open the log' }).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${RAHIM}/courier-keys$`));
    await expect(main(page).getByRole('heading', { name: 'Courier key log' })).toBeVisible();
  });

  test('each call names its courier, what it did, its order and whether it worked', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/shops/${RAHIM}/courier-keys`);
    await expect(row(page, '#261021-0047')).toContainText('Steadfast');
    await expect(row(page, '#261021-0047')).toContainText('Booked a parcel');
    await expect(row(page, '#261021-0047')).toContainText('Worked');
    await expect(row(page, '#261021-0031')).toContainText('Failed');
    await expect(row(page, 'Renewed the login')).toContainText('None');
    await expect(row(page, 'Read payouts')).toContainText('Steadfast');
  });

  test('says when there are no calls yet', async ({ page }) => {
    await mockApi(page, { courierUses: [] });
    await page.goto(`/shops/${RAHIM}/courier-keys`);
    await expect(main(page).getByText('No calls yet')).toBeVisible();
  });
});
