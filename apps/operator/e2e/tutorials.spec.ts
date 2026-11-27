import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fakeMp4, type FakeMp4 } from './support/fake-mp4';
import { mockApi, type ApiLog } from './support/mock-api';
import { drawnConsoleTutorials, DRAWN_PLAYLIST } from './support/tutorials-mock';

// OPERATOR-CONSOLE-DESIGN §10h (the sketch's `tv-*`): the console's Tutorials page -- the series' 14 rows, a part's file
// uploaded (a landscape one refused before it is sent), replaced by its next version, removed, watched in the sellers'
// player, and the optional YouTube playlist link. Each test runs on a phone and on a desktop.

async function open(page: Page): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'bn', tutorials: drawnConsoleTutorials() });
  await page.goto('/tutorials');
  await expect(page.getByRole('heading', { name: 'টিউটোরিয়াল' })).toBeVisible();
  return log;
}

function row(page: Page, title: string): Locator {
  return page.locator('main section > div', { hasText: title });
}

/** A file chosen in the sheet, written out first: Playwright hands a browser at most 50 MB from memory. */
async function choose(page: Page, name: string, spec: FakeMp4): Promise<void> {
  const path = test.info().outputPath(name);
  await writeFile(path, fakeMp4(spec));
  await page
    .getByRole('dialog')
    .getByLabel('ফাইল সিলেক্ট করুন', { exact: true })
    .setInputFiles(path);
}

test("lists the series in order with each part's file, length and status (tv-tutorials)", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText('৭টি লাইভ')).toBeVisible();
  await expect(page.getByText('৭টিতে ভিডিও নেই')).toBeVisible();
  await expect(page.locator('main section > div').filter({ hasText: 'দেখায়:' })).toHaveCount(14);
  const product = row(page, 'পর্ব ৩ · প্রোডাক্ট যোগ');
  await expect(product).toContainText('দেখায়: প্রোডাক্ট (খালি অবস্থায়), কুইক অ্যাড');
  await expect(product).toContainText('platform/tutorials/03-add-product-v2.mp4');
  await expect(product).toContainText('৩:১২');
  await expect(product).toContainText('লাইভ');
  const campaign = row(page, 'পর্ব ৬খ · অ্যাড ক্যাম্পেইন');
  await expect(campaign).toContainText('এখনো ফাইল নেই। অ্যাপে এর সারি লুকানো থাকে।');
  await expect(campaign.getByRole('button', { name: 'আপলোড' })).toBeVisible();
});

test('refuses a landscape file before it is sent, then uploads a 9:16 one and makes it live (tv-upload-bad, tv-upload, tv-uploaded)', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, 'পর্ব ৬খ · অ্যাড ক্যাম্পেইন').getByRole('button', { name: 'আপলোড' }).click();
  const sheet = page.getByRole('dialog', { name: 'ভিডিও আপলোড' });
  await choose(page, 'ad-campaign-youtube.mp4', {
    width: 1920,
    height: 1080,
    seconds: 185,
    mb: 41,
  });
  await expect(
    sheet.getByText(
      'এই ফাইলটা আড়াআড়ি (1920 × 1080)। খাড়া ৯:১৬ ফাইল সিলেক্ট করুন, যেমন 1080 × 1920।',
    ),
  ).toBeVisible();
  await expect(sheet.getByText('41 MB, ৮০ MB-এর কম')).toBeVisible();
  const send = sheet.getByRole('button', { name: 'আপলোড করে লাইভ করুন' });
  await expect(send).toBeDisabled();
  await choose(page, 'ad-campaign-final.mp4', { width: 1080, height: 1920, seconds: 155, mb: 21 });
  await expect(sheet.getByText('খাড়া ৯:১৬ (1080 × 1920)')).toBeVisible();
  await expect(sheet.getByText('H.264 আর AAC সহ MP4')).toBeVisible();
  await expect(sheet.getByText('platform/tutorials/06b-ad-campaign-v1.mp4')).toBeVisible();
  await expect(sheet.getByText('বিজ্ঞাপন ও ফিড')).toBeVisible();
  await send.click();
  await expect(
    page.getByText(
      'পর্ব ৬খ লাইভ হয়েছে। সব শপের অ্যাপে বিজ্ঞাপন ও ফিড স্ক্রিনে এখন এর সারি দেখাবে।',
    ),
  ).toBeVisible();
  await expect(row(page, 'পর্ব ৬খ · অ্যাড ক্যাম্পেইন')).toContainText('২:৩৫');
  expect(log.sent('POST', '/operator/tutorials/06b-ad-campaign/uploads')).toMatchObject({
    contentType: 'video/mp4',
  });
  expect(log.sent('PUT', '/operator/tutorials/06b-ad-campaign')).toEqual({
    uploadKey: 'tutorials/06b-ad-campaign/upload-1',
  });
  await expect(page.getByText('৮টি লাইভ')).toBeVisible();
});

test('refuses a file without AAC sound, and one over 80 MB', async ({ page }) => {
  await open(page);
  await row(page, 'পর্ব ৮ · Pathao আর RedX').getByRole('button', { name: 'আপলোড' }).click();
  const sheet = page.getByRole('dialog', { name: 'ভিডিও আপলোড' });
  await choose(page, 'silent.mp4', { width: 1080, height: 1920, seconds: 60, audio: null });
  await expect(sheet.getByText('H.264 ভিডিও আর AAC সাউন্ডসহ MP4 নয়')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'আপলোড করে লাইভ করুন' })).toBeDisabled();
  await choose(page, 'huge.mp4', { width: 1080, height: 1920, seconds: 60, mb: 81 });
  await expect(sheet.getByText('81 MB, ৮০ MB-এর বেশি')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'আপলোড করে লাইভ করুন' })).toBeDisabled();
});

test('replaces a live video with its next version, saying why the name moves on (tv-replace, tv-replaced)', async ({
  page,
}) => {
  await open(page);
  await row(page, 'পর্ব ৩ · প্রোডাক্ট যোগ').getByRole('button', { name: 'বদলান' }).click();
  const sheet = page.getByRole('dialog', { name: 'ভিডিও বদলান' });
  await expect(sheet.getByText('platform/tutorials/03-add-product-v2.mp4 · ৩:১২')).toBeVisible();
  await expect(sheet.getByText(/একই নামে রাখলে পুরোনো ভিডিওই চলতে থাকত/)).toBeVisible();
  await choose(page, 'add-product-new.mp4', { width: 1080, height: 1920, seconds: 200, mb: 24 });
  await expect(sheet.getByText('platform/tutorials/03-add-product-v3.mp4')).toBeVisible();
  await sheet.getByRole('button', { name: 'বদলে লাইভ করুন' }).click();
  await expect(
    page.getByText('পর্ব ৩ বদলানো হয়েছে। সেলাররা পরের বার খুললেই নতুন ভিডিও পাবেন।'),
  ).toBeVisible();
  await expect(row(page, 'পর্ব ৩ · প্রোডাক্ট যোগ')).toContainText(
    'platform/tutorials/03-add-product-v3.mp4',
  );
});

test('removes a video after a confirm: its screen and Menu are named (tv-remove)', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, 'পর্ব ৭ · Steadfast')
    .getByRole('button', { name: 'সরান: পর্ব ৭ · Steadfast' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'এই ভিডিও সরাবেন?' });
  await expect(
    sheet.getByText(/সব শপের অ্যাপে কুরিয়ার স্ক্রিন থেকে এর সারি সরে যাবে/),
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'সরান' }).click();
  await expect(page.getByText('পর্ব ৭ সরানো হয়েছে। ফাইলটা ৭ দিন পরে মুছে যাবে।')).toBeVisible();
  await expect(row(page, 'পর্ব ৭ · Steadfast')).toContainText('ভিডিও নেই');
  expect(
    log.calls.some(
      (call) => call.method === 'DELETE' && call.path === '/operator/tutorials/07-steadfast',
    ),
  ).toBe(true);
});

test("watches a live video in the sellers' player (tv-preview)", async ({ page }) => {
  await open(page);
  await row(page, 'পর্ব ৩ · প্রোডাক্ট যোগ').getByRole('button', { name: 'দেখুন' }).click();
  const sheet = page.getByRole('dialog', { name: 'পর্ব ৩ · প্রোডাক্ট যোগ' });
  await expect(sheet.locator('video')).toHaveAttribute('src', /03-add-product-v2\.mp4$/);
  await expect(sheet.getByText('সেলাররা যে প্লেয়ারে দেখেন, সেটাই, একই মাপে।')).toBeVisible();
});

test('keeps the playlist link optional: another address is refused, empty takes it away', async ({
  page,
}) => {
  const log = await open(page);
  const field = page.getByLabel('প্লেলিস্টের লিংক');
  await expect(field).toHaveValue(DRAWN_PLAYLIST);
  await field.fill('https://example.com/list');
  await expect(page.getByText('https:// দিয়ে শুরু হওয়া একটা YouTube লিংক দিন।')).toBeVisible();
  await expect(page.getByRole('button', { name: 'সেভ করুন' })).toBeDisabled();
  await field.fill('');
  await page.getByRole('button', { name: 'সেভ করুন' }).click();
  await expect(page.getByText('প্লেলিস্টের লিংক সরানো হয়েছে।')).toBeVisible();
  expect(log.sent('PUT', '/operator/tutorials/playlist')).toEqual({ playlistUrl: null });
});
