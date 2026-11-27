import { expect, test, type Page } from '@playwright/test';
import { drawnChats, RAHIM, type ChatMockState } from './support/chat-mock';
import { mockApi, type ApiLog, type ConsoleState } from './support/mock-api';

// LIVE-CHAT-PLAN (PR 1, the sketch's `oc-*`): Lytro's side of the live chat -- the floating button on any console page
// while a shop waits (LC-4), the inbox, one chat with its shop beside it (two name colours for owner and staff, the shop's
// name opening its page), quick replies that only fill the box, the chat's settings page, my notifications, and the shop
// page's own chat setting (LC-2). Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ConsoleState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'bn', ...state });
  await page.goto(path);
  return log;
}

function waiting(): ChatMockState {
  return drawnChats();
}

test('a waiting chat brings the floating button to any page, with its shop and count (oc-fab)', async ({
  page,
}) => {
  await open(page, '/', { chats: waiting() });
  const fab = page.getByTestId('chat-fab');
  await expect(fab).toBeVisible();
  await expect(fab).toContainText('Rahim Fashion');
  await expect(fab).toContainText('1');
  await fab.click();
  await expect(page).toHaveURL(new RegExp(`/inbox/${RAHIM}$`));
  // On the chats' own pages the button steps aside.
  await expect(page.getByTestId('chat-fab')).toHaveCount(0);
});

test('nothing waiting, no button', async ({ page }) => {
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('chat-fab')).toHaveCount(0);
});

test('the inbox lists the shop waiting; its chat shows the shop beside it (oc-inbox, oc-chat)', async ({
  page,
}) => {
  const log = await open(page, '/inbox', { chats: waiting() });
  await expect(page.getByRole('heading', { name: 'চ্যাট', level: 1 })).toBeVisible();
  await page.getByText('Rahim Fashion').first().click();
  await expect(page).toHaveURL(new RegExp(`/inbox/${RAHIM}$`));
  await expect(
    page.getByText('কুরিয়ার লেবেলে ঠিকানা কেটে যাচ্ছে। একটু দেখবেন?').last(),
  ).toBeVisible();
  // The shop's name opens its shop page.
  const shopLink = page.getByTestId('chat-shop-link');
  await expect(shopLink).toHaveAttribute('href', new RegExp(`/shops/${RAHIM}`));
  // The page the shop was on, and the people in the chat.
  await expect(page.getByText('/orders/261127-0012')).toBeVisible();
  await expect(page.getByText('সুমি').first()).toBeVisible();
  // Read on opening.
  await expect
    .poll(() => log.calls.some((call) => call.path === `/operator/chats/${RAHIM}/read`))
    .toBe(true);
});

test('a quick reply fills the box and never sends by itself; Send answers (oc-quick)', async ({
  page,
}) => {
  const log = await open(page, `/inbox/${RAHIM}`, { chats: waiting() });
  await page.getByRole('button', { name: /দ্রুত উত্তর/ }).click();
  await page.getByText('লেবেলের কাগজ', { exact: true }).click();
  const box = page.getByRole('textbox').last();
  await expect(box).toHaveValue('লেবেল প্রিন্টের সময় কাগজ A6 বেছে নিন, পুরো ঠিকানা আসবে।');
  expect(log.calls.some((call) => call.method === 'POST' && call.path.endsWith('/messages'))).toBe(
    false,
  );
  await page.getByRole('button', { name: /পাঠান/ }).click();
  await expect
    .poll(() => log.calls.some((call) => call.method === 'POST' && call.path.endsWith('/messages')))
    .toBe(true);
});

test("the chat's settings: the help line's hours, four rules, and the quick replies (oc-settings-chat)", async ({
  page,
}) => {
  const log = await open(page, '/settings/chat', { chats: waiting() });
  await expect(page.getByRole('heading', { name: 'লাইভ চ্যাট', level: 1 })).toBeVisible();
  await expect(page.getByText('9 AM – 10 PM')).toBeVisible();
  for (const name of ['ব্যস্ত লাইন যায়', 'মেসেজ থাকে', 'ছবি থাকে', 'জন প্রতি মেসেজ']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('লেবেলের কাগজ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'নতুন দ্রুত উত্তর' }).click();
  await page.getByLabel('শিরোনাম').fill('টপ-আপের সময়');
  await page.getByLabel('উত্তর', { exact: true }).fill('টপ-আপ সাধারণত এক ঘণ্টার মধ্যে যোগ হয়।');
  await page.getByRole('button', { name: 'সেভ' }).click();
  await expect(page.getByText('টপ-আপের সময়', { exact: true })).toBeVisible();
  expect(log.sent('POST', '/operator/chat/quick-replies')).toMatchObject({ title: 'টপ-আপের সময়' });
});

test('my notifications: the button, its sound and phone pushes, on this browser (oc-notif)', async ({
  page,
}) => {
  await open(page, '/account/notifications', { chats: waiting() });
  await expect(page.getByRole('heading', { name: 'আমার নোটিফিকেশন', level: 1 })).toBeVisible();
  const fab = page.getByRole('switch', { name: 'নতুন চ্যাট মেসেজ' });
  await expect(fab).toHaveAttribute('aria-checked', 'true');
  await fab.click();
  await expect(fab).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('সাউন্ড').selectOption('soft');
  await expect(page.getByRole('button', { name: /শুনুন/ })).toBeEnabled();
  // This server sets no push key in the test: the switch can't be turned on, and says why.
  await expect(page.getByRole('switch', { name: 'ফোনে নোটিফিকেশন' })).toBeDisabled();
  // Turned off, the floating button stays away even with a chat waiting.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('chat-fab')).toHaveCount(0);
});

test("the shop page sets the shop's own chat, over its plan (oc-shop-features)", async ({
  page,
}) => {
  const chats = waiting();
  const log = await open(page, `/shops/${RAHIM}`, { chats });
  const select = page.getByLabel('Lytro-র সাথে লাইভ চ্যাট');
  await expect(select).toHaveValue('plan');
  await select.selectOption('off');
  await expect.poll(() => chats.feature.mode).toBe('off');
  expect(log.sent('PUT', `/operator/chats/${RAHIM}/feature`)).toEqual({ mode: 'off' });
});
