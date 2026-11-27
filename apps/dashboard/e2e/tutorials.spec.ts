import { expect, test, type Page } from '@playwright/test';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnTutorials, noTutorials } from './support/tutorials';

// TENANT-DASHBOARD-DESIGN §7.49 and §7.49a (the sketch's `tv-*`): the tutorial videos. A row under the title on each mapped
// screen while its video has a file, hidden per person with "আর দেখাবেন না"; one card on বিজ্ঞাপন ও ফিড; part 4 inside the
// shop link card until watched; Lytro's own player; Menu › টিউটোরিয়াল; and the owner's videos at the head of Home's
// set-up card. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, state);
  await page.goto(`/${SLUG}${path}`);
  return log;
}

const ROW_PART_3 = /ভিডিও দেখুন: কীভাবে প্রোডাক্ট যোগ করবেন/;

test('no file, no row: a screen points at no video before Lytro uploads one', async ({ page }) => {
  await open(page, '/products', { tutorials: noTutorials() });
  await expect(page.getByRole('link', { name: 'প্রোডাক্ট যোগ করুন' }).first()).toBeVisible();
  await expect(page.getByText(ROW_PART_3)).toHaveCount(0);
});

test('a screen shows its row; it opens the player, which closes back to the screen (tv-products, tv-player)', async ({
  page,
}) => {
  await open(page, '/products', { tutorials: drawnTutorials() });
  await expect(page.getByText(ROW_PART_3)).toBeVisible();
  await expect(page.getByText('পর্ব ৩ · ৩:১২ ·')).toBeVisible();
  await page.getByText(ROW_PART_3).click();
  const player = page.getByRole('dialog', { name: 'পর্ব ৩ · প্রোডাক্ট যোগ' });
  await expect(player).toBeVisible();
  await expect(
    player.getByRole('button', { name: /পরের ভিডিও\s*পর্ব ৪ · লিংক শেয়ার/ }),
  ).toBeVisible();
  await player.getByRole('button', { name: 'বন্ধ করুন' }).click();
  await expect(player).toHaveCount(0);
  await expect(page.getByText(ROW_PART_3)).toBeVisible();
});

test('a video played to the end counts as watched, and the end offers it again or the next (tv-player-end)', async ({
  page,
}) => {
  const log = await open(page, '/products', { tutorials: drawnTutorials() });
  await page.getByText(ROW_PART_3).click();
  const player = page.getByRole('dialog', { name: 'পর্ব ৩ · প্রোডাক্ট যোগ' });
  await player.locator('video').dispatchEvent('ended');
  await expect(player.getByRole('button', { name: 'আবার দেখুন' })).toBeVisible();
  await expect(
    player.getByRole('button', { name: 'পরের ভিডিও: পর্ব ৪ · লিংক শেয়ার' }),
  ).toBeVisible();
  await expect
    .poll(() => log.calls.some((call) => call.path === '/tutorials/03-add-product/watched'))
    .toBe(true);
  await player.getByRole('button', { name: 'পরের ভিডিও: পর্ব ৪ · লিংক শেয়ার' }).click();
  await expect(page.getByRole('dialog', { name: 'পর্ব ৪ · লিংক শেয়ার' })).toBeVisible();
});

test('"আর দেখাবেন না" hides the screen\'s row for this person, with the toast (tv-dismissed)', async ({
  page,
}) => {
  const log = await open(page, '/products', { tutorials: drawnTutorials() });
  await page.getByRole('button', { name: 'আর দেখাবেন না' }).click();
  await expect(
    page.getByText('এই স্ক্রিনে আর দেখাবে না। সব ভিডিও মেনু › টিউটোরিয়ালে আছে।'),
  ).toBeVisible();
  await expect(page.getByText(ROW_PART_3)).toHaveCount(0);
  expect(log.sent('POST', '/tutorials/dismissals')).toEqual({ screen: 'products' });
});

test('Ads and feed: one card for its videos, the one without a file left out (tv-meta)', async ({
  page,
}) => {
  await open(page, '/settings/meta', { tutorials: drawnTutorials() });
  await expect(page.getByText('এই পেজের ভিডিও')).toBeVisible();
  await expect(page.getByText(/কীভাবে Meta Pixel যোগ করবেন/)).toBeVisible();
  await expect(page.getByText(/কীভাবে প্রোডাক্ট বুস্ট করবেন/)).toBeVisible();
  await expect(page.getByText(/কীভাবে অ্যাড ক্যাম্পেইন দেবেন/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'আর দেখাবেন না' })).toHaveCount(1);
});

test('Shop details: part 1 under the title, part 4 in the link card until watched (tv-shopdetails)', async ({
  page,
}) => {
  await open(page, '/settings/shop', { tutorials: drawnTutorials() });
  await expect(page.getByText(/কীভাবে শপ সাজাবেন/)).toBeVisible();
  const linkRow = page.locator('[data-tutorial="04-share-links"]');
  await expect(linkRow).toBeVisible();
  await expect(linkRow.getByRole('button', { name: 'আর দেখাবেন না' })).toHaveCount(0);

  await open(page, '/settings/shop', {
    tutorials: drawnTutorials(['01-shop-setup', '02-categories', '04-share-links']),
  });
  await expect(page.getByText(/কীভাবে শপ সাজাবেন/)).toBeVisible();
  await expect(page.locator('[data-tutorial="04-share-links"]')).toHaveCount(0);
});

test('Menu › Tutorials: the new count, the series in order, coming soon, the playlist (tv-menu, tv-list)', async ({
  page,
}) => {
  await open(page, '/menu', { tutorials: drawnTutorials() });
  const row = page.getByRole('link', { name: /টিউটোরিয়াল/ });
  await expect(row).toContainText('৫টি নতুন');
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/tutorials$`));
  await expect(
    page.getByText(
      'ছোট ছোট ভিডিওতে ধাপে ধাপে লিট্রো চালানো শিখুন। ক্রম অনুযায়ী দেখলে সবচেয়ে সহজ হয়।',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /পর্ব ১ · শপ সাজানো.*দেখা হয়েছে/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /পর্ব ৩ · প্রোডাক্ট যোগ.*নতুন/ })).toBeVisible();
  await expect(page.getByText('পর্ব ৬খ · অ্যাড ক্যাম্পেইন')).toBeVisible();
  await expect(page.getByRole('button', { name: /পর্ব ৬খ/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'সব ভিডিও YouTube-এ দেখুন' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/playlist?list=PLOcfDXgUTCdc',
  );
});

test('Home: the set-up card opens with the next video, the four and the step chips (tv-home-new)', async ({
  page,
}) => {
  await open(page, '', {
    ...DAY_ONE,
    home: { ...DAY_ONE.home, tutorialsHead: 'full' },
    tutorials: drawnTutorials([]),
  });
  await expect(page.getByText('ভিডিও দেখে শুরু করুন')).toBeVisible();
  await expect(page.getByText('০/৪ দেখা হয়েছে')).toBeVisible();
  await expect(page.getByText('প্রথমে এই ভিডিওটা দেখুন')).toBeVisible();
  await expect(page.getByText('পর্ব ১ · শপ সাজানো')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ভিডিও · ৩:১২' })).toBeVisible();
  await page.getByRole('button', { name: 'ভিডিও · ৩:১২' }).click();
  await expect(page.getByRole('dialog', { name: 'পর্ব ৩ · প্রোডাক্ট যোগ' })).toBeVisible();
});

test('Home: two watched, then all four (one line), then "আর দেখাবেন না" (tv-home-half, -done, -dismissed)', async ({
  page,
}) => {
  const day = { ...DAY_ONE, home: { ...DAY_ONE.home, tutorialsHead: 'full' } };
  await open(page, '', { ...day, tutorials: drawnTutorials() });
  await expect(page.getByText('২/৪ দেখা হয়েছে')).toBeVisible();
  await expect(page.getByText('এরপর এই ভিডিওটা দেখুন')).toBeVisible();
  await expect(page.getByText('পর্ব ৩ · প্রোডাক্ট যোগ')).toBeVisible();

  const log = await open(page, '', {
    ...day,
    tutorials: drawnTutorials([
      '01-shop-setup',
      '02-categories',
      '03-add-product',
      '04-share-links',
    ]),
  });
  await expect(page.getByText('শুরুর ৪টি ভিডিও দেখা হয়েছে।')).toBeVisible();
  await expect(page.getByText('ভিডিও দেখে শুরু করুন')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ভিডিও · ১:১৫' })).toBeVisible();

  const again = await open(page, '', { ...day, tutorials: drawnTutorials() });
  await page.getByRole('button', { name: 'আর দেখাবেন না' }).click();
  await expect(
    page.getByText('হোমে আর ভিডিও দেখাবে না। সব ভিডিও মেনু › টিউটোরিয়ালে আছে।'),
  ).toBeVisible();
  await expect(page.getByText('ভিডিও দেখে শুরু করুন')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^ভিডিও · / })).toHaveCount(0);
  expect(again.sent('POST', '/tutorials/dismissals')).toEqual({ screen: 'home' });
  expect(log.calls.length).toBeGreaterThan(0);
});

test('Home without the head (staff, an order, the card folded): no videos, no chips', async ({
  page,
}) => {
  await open(page, '', { ...DAY_ONE, tutorials: drawnTutorials([]) });
  await expect(page.getByText('শপ প্রস্তুত করুন')).toBeVisible();
  await expect(page.getByText('ভিডিও দেখে শুরু করুন')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^ভিডিও · / })).toHaveCount(0);
});

test('the first landing stays quick add: the welcome, then the row for part 3 (tv-first-landing)', async ({
  page,
}) => {
  await open(page, '/products/new?first=1', { ...DAY_ONE, tutorials: drawnTutorials([]) });
  const row = page.getByText(ROW_PART_3);
  await expect(row).toBeVisible();
  await expect(page.getByText(ROW_PART_3)).toHaveCount(1);
});
