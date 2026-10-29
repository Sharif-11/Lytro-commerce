import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnDelivery, type DeliveryFixture } from './support/delivery';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.10, Slice 11.11 (the prototype's `delivery` and Part 22; DLV-01 to DLV-07, RAT-14): the
// home area and its two charges, each fixed zone renamed or back to its automatic name, no delivery outside; one Save
// sending only what changed; a new zone's areas from the picker, a thana moving from a broader zone, an area another
// zone holds; the shop's own thanas as its home area; a delete asked first and a zone still in use; none of its own,
// the most there may be, look-only; Check an address with why. Each test runs on a phone and on a desktop.

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/delivery`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
/** A fixed zone's charge box, by the zone's name (its Rename button names the zone too). */
const charge = (page: Page, name: string) => main(page).getByRole('textbox', { name, exact: true });

function sent(log: ApiLog, method: string, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body as Record<string, unknown>);
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

/** The drawn shop with its zones changed by `change`. */
function shop(change: (fixture: DeliveryFixture) => void): DeliveryFixture {
  const fixture = drawnDelivery('en');
  change(fixture);
  return fixture;
}

test('the home area and its two charges, the zones with their areas, the charge per kg; Check an address says why', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByRole('button', { name: /^Home area/ })).toContainText('Dhaka city');
  await expect(charge(page, 'Inside Dhaka city')).toHaveValue('70');
  await expect(charge(page, 'Outside Dhaka city')).toHaveValue('130');
  const ctg = main(page).getByRole('button', { name: /^Chattogram and Sylhet/ });
  await expect(ctg).toContainText('Chattogram city · Sylhet city');
  await expect(ctg).toContainText('৳100');
  const hill = main(page).getByRole('button', { name: /^Hill districts/ });
  await expect(hill).toContainText('No delivery');
  await expect(hill).toContainText('Bandarban · Rangamati · Khagrachhari');
  await expect(hill).not.toContainText('৳');
  await expect(main(page).getByLabel('Extra per kg after the first')).toHaveValue('20');
  await expect(main(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  await expectAccessible(page);

  await main(page)
    .getByRole('button', { name: /^District and thana/ })
    .click();
  const check = sheet(page, 'Check an address');
  await check.getByLabel('Search a city, district or thana').fill('panch');
  await check.getByRole('button', { name: 'Panchlaish · Chattogram' }).click();
  await expect(main(page)).toContainText('Chattogram and Sylhet · ৳100 · matched by city');

  await main(page)
    .getByRole('button', { name: /^District and thana/ })
    .click();
  await check.getByLabel('Search a city, district or thana').fill('ruma');
  await check.getByRole('button', { name: 'Ruma · Bandarban' }).click();
  await expect(main(page)).toContainText('Hill districts');
  await expect(main(page)).toContainText('matched by district');
  await expectAccessible(page);
});

test('one Save sends only what changed: a charge, a rename, no delivery outside, the charge per kg', async ({
  page,
}) => {
  const log = await open(page);
  await charge(page, 'Inside Dhaka city').fill('80');
  await main(page).getByRole('button', { name: 'Rename Inside Dhaka city' }).click();
  const rename = sheet(page, 'Zone name');
  await rename.getByLabel('Name').fill('Dhaka metro');
  await rename.getByRole('button', { name: 'Done' }).click();
  await expect(charge(page, 'Dhaka metro')).toHaveValue('80');
  await main(page).getByRole('switch', { name: 'No delivery outside Dhaka city' }).click();
  await expect(main(page)).toContainText('While on, orders from outside Dhaka city are not taken.');
  await expect(charge(page, 'Outside Dhaka city')).toHaveCount(0);
  await main(page).getByLabel('Extra per kg after the first').fill('25');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(sent(log, 'PATCH', '/delivery-zones/z-in')).toEqual([{ charge: 80, name: 'Dhaka metro' }]);
  expect(sent(log, 'PATCH', '/delivery-zones/z-out')).toEqual([{ noDelivery: true }]);
  expect(sent(log, 'PATCH', '/shop-settings')).toEqual([{ extraDeliveryChargePerKg: 25 }]);
});

test('a renamed zone goes back to its automatic name', async ({ page }) => {
  const log = await open(page, {
    delivery: shop((fixture) => {
      const home = fixture.zones.find((zone) => zone.id === 'z-in');
      if (home) home.name = 'Dhaka metro';
    }),
  });
  await expect(charge(page, 'Dhaka metro')).toHaveValue('70');
  await main(page).getByRole('button', { name: 'Rename Dhaka metro' }).click();
  await sheet(page, 'Zone name')
    .getByRole('button', { name: 'Use the automatic name: Inside Dhaka city' })
    .click();
  await expect(charge(page, 'Inside Dhaka city')).toHaveValue('70');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(sent(log, 'PATCH', '/delivery-zones/z-in')).toEqual([{ name: null }]);
});

test('a new zone takes areas from the picker; a thana moving from a broader zone says so', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Add zone' }).click();
  const zone = sheet(page, 'Add zone');
  await zone.getByLabel('Name').fill('Dhaka suburbs');
  await zone.getByLabel('Delivery charge').fill('100');
  await expect(zone.getByRole('button', { name: 'Save' })).toBeDisabled();
  await zone.getByRole('button', { name: 'Add a district, city or thana' }).click();
  const pick = sheet(page, 'Add an area');
  await pick.getByLabel('Search a city, district or thana').fill('sav');
  await pick.getByRole('checkbox', { name: /^Savar · Dhaka/ }).check();
  await pick.getByLabel('Search a city, district or thana').fill('banani');
  const banani = pick.getByRole('checkbox', { name: /^Banani · Dhaka/ });
  await expect(pick).toContainText('Now in Inside Dhaka city, by its city');
  await banani.check();
  await expectAccessible(page);
  await pick.getByRole('button', { name: 'Add 2 areas' }).click();
  await expect(zone.getByRole('button', { name: 'Remove Savar' })).toBeVisible();
  await expect(zone).toContainText('Banani moves from Inside Dhaka city to this zone.');
  await zone.getByRole('button', { name: 'Save' }).click();
  await expect(zone).toBeHidden();
  expect(sent(log, 'POST', '/delivery-zones')).toEqual([
    {
      name: 'Dhaka suburbs',
      charge: 100,
      noDelivery: false,
      areas: { cityCodes: [], zillaIds: [], locationIds: [105, 101] },
    },
  ]);
  await expect(main(page).getByRole('button', { name: /^Dhaka suburbs/ })).toContainText(
    'Savar · Banani',
  );
});

test('an area another zone holds is not picked, and on a zone it is named and red until removed', async ({
  page,
}) => {
  const log = await open(page, {
    // Bandarban sits in two zones, as it would if the Hill districts took it after this zone was read.
    delivery: shop((fixture) => {
      const ctg = fixture.zones.find((zone) => zone.id === 'z-ctg');
      if (ctg) ctg.zillaIds = [4];
    }),
  });
  await main(page)
    .getByRole('button', { name: /^Chattogram and Sylhet/ })
    .click();
  const zone = sheet(page, 'Zone');
  await expect(zone).toContainText(
    'Bandarban district is in Hill districts. Remove it here, or take it out of that zone first.',
  );
  await expect(zone.getByRole('button', { name: 'Save' })).toBeDisabled();
  await zone.getByRole('button', { name: 'Add a district, city or thana' }).click();
  const pick = sheet(page, 'Add an area');
  await pick.getByLabel('Search a city, district or thana').fill('khagra');
  const taken = pick.getByRole('checkbox', { name: /^Khagrachhari district/ });
  await expect(taken).toBeDisabled();
  await expect(pick).toContainText('In Hill districts');
  await pick.getByRole('button', { name: 'Back' }).click();
  await zone.getByRole('button', { name: 'Remove Bandarban district' }).click();
  await expect(zone.getByRole('button', { name: 'Save' })).toBeEnabled();
  await zone.getByRole('button', { name: 'Save' }).click();
  await expect(zone).toBeHidden();
  expect(sent(log, 'PUT', '/delivery-zones/z-ctg/areas')).toEqual([
    { areas: { cityCodes: ['chattogram', 'sylhet'], zillaIds: [], locationIds: [] } },
  ]);
});

test("the home area: the shop's own thanas, or a district, with the two zones' names as they will read", async ({
  page,
}) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /^Home area/ })
    .click();
  const home = sheet(page, 'Home area');
  await home.getByRole('radio', { name: 'My own thanas' }).click();
  await home.getByRole('button', { name: 'Add a thana' }).click();
  const pick = sheet(page, 'Add a thana');
  await pick.getByLabel('Search a city, district or thana').fill('mir');
  await pick.getByRole('checkbox', { name: /^Mirpur · Dhaka/ }).check();
  await pick.getByLabel('Search a city, district or thana').fill('pall');
  await pick.getByRole('checkbox', { name: /^Pallabi · Dhaka/ }).check();
  await pick.getByRole('button', { name: 'Add 2 areas' }).click();
  await expect(home).toContainText('Inside Mirpur and Pallabi');
  await expect(home).toContainText('Outside Mirpur and Pallabi');
  await expect(home).toContainText('unless you named them');
  await expectAccessible(page);
  await home.getByRole('button', { name: 'Save' }).click();
  await expect(home).toBeHidden();
  expect(sent(log, 'PUT', '/delivery-zones/home-area')).toEqual([
    { areas: { cityCodes: [], zillaIds: [], locationIds: [102, 103] } },
  ]);
  await expect(main(page).getByRole('button', { name: /^Home area/ })).toContainText(
    'Mirpur and Pallabi',
  );
  await expect(charge(page, 'Inside Mirpur and Pallabi')).toHaveValue('70');

  await main(page)
    .getByRole('button', { name: /^Home area/ })
    .click();
  await home.getByRole('radio', { name: 'A district' }).click();
  await home.getByRole('button', { name: 'Gazipur district' }).click();
  await home.getByRole('button', { name: 'Save' }).click();
  await expect(home).toBeHidden();
  expect(sent(log, 'PUT', '/delivery-zones/home-area').at(-1)).toEqual({
    areas: { cityCodes: [], zillaIds: [2], locationIds: [] },
  });
});

test('a delete asks first; a zone products still name lists them, an archived one to restore', async ({
  page,
}) => {
  const log = await open(page, {
    delivery: shop((fixture) => {
      fixture.holders = {
        'z-ctg': [
          { id: 'p-1', name: 'Cotton T-shirt', archived: false },
          { id: 'p-8', name: 'Wool muffler', archived: true },
        ],
      };
    }),
  });
  await main(page)
    .getByRole('button', { name: /^Chattogram and Sylhet/ })
    .click();
  await sheet(page, 'Zone').getByRole('button', { name: 'Delete zone' }).click();
  const ask = sheet(page, 'Delete "Chattogram and Sylhet"?');
  await expect(ask).toContainText('Past orders keep their charge.');
  await ask.getByRole('button', { name: 'Delete zone' }).click();
  const inUse = sheet(page, 'This zone is still in use');
  await expect(inUse.getByRole('link', { name: 'Open' })).toHaveAttribute(
    'href',
    `/${SLUG}/products/p-1`,
  );
  await expect(inUse).toContainText('Wool muffler');
  await expect(inUse).toContainText('Archived');
  await expectAccessible(page);
  await inUse.getByRole('button', { name: 'Restore' }).click();
  await expect(inUse.getByRole('link', { name: 'Open' })).toHaveCount(2);
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/products/p-8/restore'),
  ).toBe(true);
  await inUse.getByRole('button', { name: 'Close' }).click();

  await main(page)
    .getByRole('button', { name: /^Hill districts/ })
    .click();
  await sheet(page, 'Zone').getByRole('button', { name: 'Delete zone' }).click();
  await sheet(page, 'Delete "Hill districts"?')
    .getByRole('button', { name: 'Delete zone' })
    .click();
  await expect(main(page).getByRole('button', { name: /^Hill districts/ })).toHaveCount(0);
  expect(log.calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
});

test('none of its own says so with Add zone; at the most there may be, Add zone gives way to the limit', async ({
  page,
}) => {
  await open(page, {
    delivery: shop((fixture) => {
      fixture.zones = fixture.zones.filter((zone) => zone.isHome || zone.isFallback);
    }),
  });
  await expect(main(page)).toContainText('No zones of your own yet.');
  await expect(main(page).getByRole('button', { name: 'Add zone' })).toHaveCount(1);

  await open(page, {
    delivery: shop((fixture) => {
      fixture.maxZones = 4;
    }),
  });
  await expect(main(page)).toContainText('20 zones is the most.');
  await expect(main(page).getByRole('button', { name: 'Add zone' })).toHaveCount(0);
});

test('someone who may only look sees the values, no Save, Add zone or Rename; Check still works', async ({
  page,
}) => {
  await open(page, { isOwner: false, permissions: ['products:read'] });
  await expect(charge(page, 'Inside Dhaka city')).not.toBeEditable();
  await expect(main(page).getByRole('button', { name: 'Save' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Add zone' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Rename/ })).toHaveCount(0);
  await expect(main(page).getByRole('switch')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Chattogram and Sylhet/ })).toHaveCount(0);
  await main(page)
    .getByRole('button', { name: /^District and thana/ })
    .click();
  const check = sheet(page, 'Check an address');
  await check.getByLabel('Search a city, district or thana').fill('kotw');
  await check.getByRole('button', { name: 'Kotwali · Sylhet' }).click();
  await expect(main(page)).toContainText('Chattogram and Sylhet · ৳100 · matched by city');
  await expectAccessible(page);
});
