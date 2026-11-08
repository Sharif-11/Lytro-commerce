import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ConsoleState } from './support/mock-api';
import { phase7Changes, phase7RateHistory, phase7Rates } from './support/notice-mock';

// OPERATOR-CONSOLE-DESIGN §10c (Phase 7 Slice 7.7): Lytro's notices -- the list, a new one from blank or a template,
// the editor and its refusals, scheduling and publishing, a notice's page, editing it live, withdrawing it, and who said
// "I understand" -- against Slice 7.4's routes, mocked.

const PHASE_7: ConsoleState = {
  rates: phase7Rates(),
  rateHistory: phase7RateHistory(),
  changes: phase7Changes(),
};

async function open(page: Page, path = '/notices', state: ConsoleState = {}) {
  const log = await mockApi(page, { ...PHASE_7, ...state });
  await page.goto(path);
  return log;
}

const main = (page: Page) => page.getByRole('main');
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toast = (page: Page, words: string | RegExp) => page.getByRole('status').getByText(words);

test('lists every notice, newest written first, with where it stands and what came of it (NTC-09)', async ({
  page,
}) => {
  await open(page);
  const list = main(page);
  await expect(list).toContainText('Couriers close for Victory Day, 16 Dec');
  await expect(list).toContainText('General · English only');
  await expect(list).toContainText('not sent');
  await expect(list).toContainText('goes live 8 Nov, 10:00');
  await expect(list).toContainText('212 shops · 147 read');
  await expect(list).toContainText('41 of 212 said I understand');
  await expect(list).toContainText('Policy · updated 6 Nov 2026');
  await expect(list).toContainText('Plans: Starter, Growth, Pro');
  await expect(list).toContainText('One shop: Dhaka Gadget House');
  await expect(list).toContainText('withdrawn 2 Nov, 14:05');
  await expect(list).toContainText(
    "Newest written first. A shop's board keeps the last 24 months.",
  );
});

test('filters by category and words, served by the route (NTC-03)', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Policy' }).click();
  await expect(main(page)).toContainText("Lytro's policy updates from 15 Nov");
  await expect(main(page)).not.toContainText('Couriers close for Victory Day');
  await expect
    .poll(() => log.calls.some((call) => call.query.includes('category=policy')))
    .toBe(true);
  await main(page).getByRole('button', { name: 'All', exact: true }).click();
  await main(page).getByRole('searchbox', { name: 'Words in a notice' }).fill('Victory');
  await expect(main(page)).not.toContainText('Lytro is having problems');
  await expect.poll(() => log.calls.some((call) => call.query.includes('q=Victory'))).toBe(true);
});

test('says when there are none yet, and offers the templates', async ({ page }) => {
  await open(page, '/notices', { notices: [] });
  await expect(main(page)).toContainText('No notices yet');
  await expect(main(page)).toContainText('Write one from blank, or from a template');
  await expect(main(page)).not.toContainText('Newest written first');
});

test('a maintenance notice from its template is filled, scheduled and sent to the reach the server counts (NTC-11, NTC-12)', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New notice' }).click();
  const start = dialog(page, 'New notice');
  await start.getByText('Maintenance', { exact: true }).click();
  await expect(start.getByLabel('Window starts')).toBeVisible();
  await start.getByLabel('Window starts').fill('2026-11-10T02:00');
  await start.getByLabel('Window ends').fill('2026-11-10T04:00');
  await start.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/notices\/new\?template=maintenance/);
  await expect
    .poll(() => log.sent('POST', '/operator/notices/template'))
    .toEqual({
      template: 'maintenance',
      variables: {
        windowStartsAt: '2026-11-09T20:00:00.000Z',
        windowEndsAt: '2026-11-09T22:00:00.000Z',
      },
    });
  await expect(main(page).getByLabel('Title')).toHaveValue(
    '10 নভেম্বর রাত 2টা থেকে ভোর 4টা মেইনটেন্যান্স',
  );
  await expect(main(page)).toContainText('From the Maintenance template');
  await main(page)
    .getByRole('button', { name: /^English/ })
    .click();
  await expect(main(page).getByLabel('Title')).toHaveValue('Maintenance 10 Nov, 2 am to 4 am');
  await expect(main(page)).toContainText("Also shown once at each person's next sign-in.");
  await main(page).getByRole('button', { name: 'Schedule…' }).click();
  const panel = dialog(page, 'Schedule this notice?');
  await expect(panel).toContainText('212 shops');
  await expect(panel).toContainText('and by email to the owners');
  await expect(panel).toContainText(
    'Their dashboards count down to the window until 10 Nov, 04:00.',
  );
  await expect(panel).toContainText('No SMS is sent and no balance moves.');
  await panel.getByRole('button', { name: /^Schedule for/ }).click();
  await expect
    .poll(() => log.sent('POST', '/operator/notices/reach'))
    .toEqual({
      audience: { kind: 'all' },
      severity: 'important',
    });
  await expect
    .poll(() => log.sent('POST', '/operator/notices'))
    .toMatchObject({
      category: 'maintenance',
      severity: 'important',
      audience: { kind: 'all' },
      windowStartsAt: '2026-11-09T20:00:00.000Z',
      windowEndsAt: '2026-11-09T22:00:00.000Z',
      publishAt: '2026-10-21T09:00:00.000Z',
      // It leaves the board when its window closes, pinned until then.
      endsAt: '2026-11-09T22:00:00.000Z',
      pinned: true,
    });
  await expect(
    toast(page, /^Scheduled for 21 Oct, 15:00\. Nothing is sent before then\.$/),
  ).toBeVisible();
  await expect(main(page)).toContainText('Scheduled: it goes to the audience within a minute');
});

test('an urgent outage is published now: the marquee, the email, no SMS (NTC-04, NTC-06)', async ({
  page,
}) => {
  const log = await open(page, '/notices/new?template=outage');
  await expect(main(page)).toContainText('Also on every page, scrolling, until closed:');
  await expect(main(page)).toContainText('From Lytro: Lytro-তে সমস্যা চলছে');
  await main(page).getByRole('button', { name: 'Publish…' }).click();
  const panel = dialog(page, 'Publish this notice now?');
  await expect(panel).toContainText(
    'It scrolls across the top of every dashboard page until each person closes it.',
  );
  await panel.getByRole('button', { name: 'Publish now' }).click();
  await expect.poll(() => log.sent('POST', '/operator/notices')).toBeTruthy();
  const sent = log.sent('POST', '/operator/notices') as Record<string, unknown>;
  expect(sent).toMatchObject({ severity: 'urgent', category: 'maintenance' });
  expect(typeof sent.publishAt).toBe('string');
  await expect(toast(page, 'Published. It reaches shops within a minute.')).toBeVisible();
});

test('refuses what the server would, before anything is sent (NTC-01, NTC-16)', async ({
  page,
}) => {
  const log = await open(page, '/notices/new');
  await main(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(main(page)).toContainText("Nothing was saved. Fix what's marked, then save again.");
  await expect(main(page)).toContainText('Write a title and a body in Bangla, English or both.');
  await expect(main(page).getByText('Needed here, or in English.')).toHaveCount(2);

  await main(page).getByLabel('Title').fill('ন'.repeat(121));
  await main(page).getByLabel('Body').fill('দেখুন [এখানে](http://lytro.app/help)');
  await expect(main(page).getByText('121 / 120')).toBeVisible();
  await main(page)
    .getByRole('button', { name: /^English/ })
    .click();
  await main(page).getByLabel('Title').fill('Read delivery details from a message');
  await main(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(main(page)).toContainText(
    'The English has a title but no body. Add the body, or clear the title.',
  );
  await main(page)
    .getByRole('button', { name: /^বাংলা/ })
    .click();
  await expect(main(page)).toContainText('At most 120 characters.');
  await expect(main(page)).toContainText('A link must start with https://.');
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/operator/notices'),
  ).toBe(false);
});

test('a draft opens in the editor, English only, and saves as a draft (NTC-15)', async ({
  page,
}) => {
  const log = await open(page, '/notices/n-15');
  await expect(main(page).getByRole('heading', { name: 'Edit notice' })).toBeVisible();
  await expect(main(page).getByLabel('Title')).toHaveValue(
    'Couriers close for Victory Day, 16 Dec',
  );
  await expect(main(page)).toContainText('No Bangla yet: shops that read Bangla see the English.');
  await main(page).getByRole('button', { name: 'Save draft' }).click();
  await expect
    .poll(() => log.sent('PATCH', '/operator/notices/n-15'))
    .toMatchObject({
      titleEn: 'Couriers close for Victory Day, 16 Dec',
      titleBn: null,
      publishAt: null,
    });
  await expect(toast(page, 'Saved as a draft. Nothing was sent.')).toBeVisible();
  await expect(page).toHaveURL(/\/notices$/);
});

test('a live notice shows what came of it, its earlier version and how it is set (NTC-05, NTC-08, NTC-09)', async ({
  page,
}) => {
  await open(page, '/notices/n-11');
  await expect(
    main(page).getByRole('heading', { name: "Lytro's policy updates from 15 Nov" }),
  ).toBeVisible();
  await expect(main(page)).toContainText('Shops sent212in the audience when it went live');
  await expect(main(page)).toContainText('People told318');
  await expect(main(page)).toContainText('Read240');
  await expect(main(page)).toContainText('171 shops still to');
  await expect(main(page)).toContainText('Replaced 6 Nov, 09:12 by ops@lytro.app');
  await expect(main(page)).toContainText('Asked of owners');
  await expect(main(page)).toContainText('To owners');
  await expect(main(page)).toContainText('ops@lytro.app · 5 Nov, 09:40');
  await main(page).getByRole('button', { name: 'Show' }).click();
  const version = dialog(page, 'The version replaced 6 Nov, 09:12');
  await expect(version).toContainText('In Bangla');
  await expect(version).toContainText("A closed shop's data is deleted 60 days after it closes");
  await expect(version).not.toContainText('A payment page shoppers report may be suspended');
});

test('editing a live notice keeps its go-live time and sends nothing again (NTC-08)', async ({
  page,
}) => {
  const log = await open(page, '/notices/n-11');
  await main(page).getByRole('button', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/notices\/n-11\/edit$/);
  await expect(main(page)).toContainText('This notice is live.');
  await expect(main(page)).toContainText(
    'Live since 5 Nov, 10:00. A live notice keeps its go-live time.',
  );
  await main(page)
    .getByRole('button', { name: /^English/ })
    .click();
  await main(page).getByLabel('Title').fill("Lytro's policy changes from 15 Nov");
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => log.sent('PATCH', '/operator/notices/n-11')).toBeTruthy();
  const sent = log.sent('PATCH', '/operator/notices/n-11') as Record<string, unknown>;
  expect(sent.titleEn).toBe("Lytro's policy changes from 15 Nov");
  expect(sent).not.toHaveProperty('publishAt');
  await expect(
    toast(page, 'Saved. The board shows it as updated; nothing was sent again.'),
  ).toBeVisible();
  await expect(main(page).getByText(/^Replaced .* by ops@lytro.app$/)).toHaveCount(2);
});

test('who said I understand: still to and said it, searched by name or address (NTC-05)', async ({
  page,
}) => {
  await open(page, '/notices/n-11/acknowledgments');
  await expect(main(page).getByRole('button', { name: /^Still to/ })).toContainText('171');
  await expect(main(page).getByRole('button', { name: /^Said I understand/ })).toContainText('41');
  await expect(main(page)).toContainText('dhaka-gadget.lytro.app');
  await main(page).getByRole('searchbox', { name: 'Shop name or address' }).fill('mim');
  await expect(main(page)).toContainText('Mim Bakery');
  await expect(main(page)).not.toContainText('Keya Boutique');
  await main(page)
    .getByRole('button', { name: /^Said I understand/ })
    .click();
  await main(page).getByRole('searchbox', { name: 'Shop name or address' }).fill('');
  await expect(main(page)).toContainText('The owner, 5 Nov, 11:40');
});

test('withdrawing hides it from every shop and keeps it here, edits ended (NTC-08)', async ({
  page,
}) => {
  const log = await open(page, '/notices/n-12');
  await main(page).getByRole('button', { name: 'Withdraw' }).click();
  const panel = dialog(page, 'Withdraw this notice?');
  await expect(panel).toContainText("It disappears from every shop's board at once");
  await panel.getByRole('button', { name: 'Withdraw' }).click();
  await expect
    .poll(() => log.calls.some((call) => call.path === '/operator/notices/n-12/withdraw'))
    .toBe(true);
  await expect(toast(page, 'Withdrawn. No shop sees it now.')).toBeVisible();
  await expect(main(page)).toContainText("It can't be edited or published again.");
  await expect(main(page).getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('a scheduled notice says nothing is sent yet; an ended one offers nothing to change', async ({
  page,
}) => {
  await open(page, '/notices/n-14');
  await expect(main(page)).toContainText(
    'Scheduled: it goes to the audience within a minute of 8 Nov, 10:00. Nothing has been sent',
  );
  await expect(main(page)).not.toContainText('Shops sent');
  await page.goto('/notices/n-10');
  await expect(main(page)).toContainText('Ended 4 Nov, 09:00: it left every board then.');
  await expect(main(page).getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
});

test('a rate-change notice is filled from its change, published, and the rate says so (NTC-13, RAT-09)', async ({
  page,
}) => {
  const log = await open(page, '/notices/new?rateChange=41');
  await expect(main(page)).toContainText(
    'From the rate change of 7 Nov 2026: SMS, per part, ৳0.55 → ৳0.65.',
  );
  await main(page).getByRole('button', { name: 'Publish…' }).click();
  await dialog(page, 'Publish this notice now?')
    .getByRole('button', { name: 'Publish now' })
    .click();
  await expect
    .poll(() => log.sent('POST', '/operator/notices'))
    .toMatchObject({ rateChangeId: 41, category: 'rate_change' });
  await expect(page).toHaveURL(/\/rates\?history=sms_per_unit$/);
  await expect(toast(page, 'Published. The rate change now links to it.')).toBeVisible();
});

test("a notice's rate change opens that rate's history, which links back to it", async ({
  page,
}) => {
  await open(page, '/notices/n-13', { rateHistory: phase7RateHistory('n-13') });
  await main(page).getByRole('link', { name: 'SMS, per part ৳0.55 → ৳0.65 · 7 Nov 2026' }).click();
  await expect(page).toHaveURL(/\/rates\?history=sms_per_unit$/);
  await expect(main(page).getByRole('link', { name: 'notice published' })).toBeVisible();
});

test('in Bangla, the board falls back to the other language a notice has (NTC-15)', async ({
  page,
}) => {
  await open(page, '/notices', { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'নোটিশ' })).toBeVisible();
  await expect(main(page)).toContainText('10 নভেম্বর রাত 2টা থেকে ভোর 4টা মেইনটেন্যান্স');
  await expect(main(page)).toContainText('Couriers close for Victory Day, 16 Dec');
  await expect(main(page)).toContainText('শুধু ইংরেজি');
});

test('on a phone, the band goes back: who said I understand to its notice, a notice to the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/notices/n-11/acknowledgments');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/notices\/n-11$/);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/notices$/);
});

test('the list, the editor and a notice pass an accessibility scan', async ({ page }) => {
  for (const path of ['/notices', '/notices/new?template=policy_update', '/notices/n-11']) {
    await open(page, path);
    await expect(main(page).locator('h1')).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  }
});
