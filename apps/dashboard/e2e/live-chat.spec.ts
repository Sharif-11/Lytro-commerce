import { expect, test, type Page } from '@playwright/test';
import { ChatSenderKind, ChatSystemKind } from '@lytronix/validators';
import { chatMessage, drawnChat } from './support/chat';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// LIVE-CHAT-PLAN (PR 1, the sketch's `lc-*`): the shop's live chat with Lytro. The small button shows for five seconds
// each time Home opens (LC-19), always on Menu, and on any screen while Lytro's reply is unread (LC-13); it hides while
// the page scrolls. A shop without the chat gets nothing. Each test runs on a phone and on a desktop.

const BUTTON = 'chat-button';

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, state);
  await page.goto(`/${SLUG}${path}`);
}

function button(page: Page) {
  return page.getByTestId(BUTTON);
}

test('a shop without the chat has no button anywhere', async ({ page }) => {
  await open(page, '/menu');
  await expect(page.getByRole('heading', { name: 'মেনু' })).toBeVisible();
  await expect(button(page)).toHaveCount(0);
});

test('Home shows the button for five seconds, then it slides away (lc-home-peek, lc-home-gone)', async ({
  page,
}) => {
  await page.clock.install();
  await open(page, '', { chat: drawnChat() });
  await expect(button(page)).toHaveAttribute('data-shown', 'true');
  await page.clock.runFor(5_500);
  await expect(button(page)).toHaveAttribute('data-shown', 'false');
});

test('Menu keeps the button, and it opens the chat with the 7-day line (lc-menu, lc-chat)', async ({
  page,
}) => {
  await open(page, '/menu', { chat: drawnChat() });
  await expect(button(page)).toHaveAttribute('data-shown', 'true');
  await button(page).click();
  const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/দিনের পুরোনো মেসেজ নিজে থেকে মুছে যায়/)).toBeVisible();
  await expect(sheet.getByText('মেনু → পেমেন্ট মেথডে bKash চালু করলেই দেখাবে।')).toBeVisible();
  await sheet.getByLabel('মেসেজ লিখুন…').fill('কুরিয়ার লেবেলে ঠিকানা কেটে যাচ্ছে।');
  await sheet.getByRole('button', { name: 'পাঠান' }).click();
  await expect(sheet.getByText('কুরিয়ার লেবেলে ঠিকানা কেটে যাচ্ছে।')).toBeVisible();
});

test("Lytro's unread reply brings the button up on any screen, with its count (lc-unread-any)", async ({
  page,
}) => {
  const chat = drawnChat({ unread: 1 });
  chat.messages.push(chatMessage('m-3', ChatSenderKind.Lytro, 'লেবেলের কাগজ A6 বেছে নিন।', 0));
  await open(page, '/orders', { chat });
  await expect(button(page)).toHaveAttribute('data-shown', 'true');
  await expect(button(page)).toContainText('1');
  await button(page).click();
  // Read on opening: the count goes.
  await page
    .getByRole('dialog', { name: 'Lytro সাপোর্ট' })
    .getByText('লেবেলের কাগজ A6 বেছে নিন।')
    .waitFor();
  await page.keyboard.press('Escape');
  await expect(button(page)).toHaveAttribute('data-shown', 'false');
});

test('outside the hours, and after ten minutes, the chat says when Lytro will answer (lc-offhours, lc-busy)', async ({
  page,
}) => {
  const chat = drawnChat({ hours: { opensHour: 9, closesHour: 22, open: false } });
  chat.messages.push(
    chatMessage('m-3', ChatSenderKind.System, '', 0, { systemKind: ChatSystemKind.OffHours }),
    chatMessage('m-4', ChatSenderKind.System, '', 0, { systemKind: ChatSystemKind.Busy }),
  );
  await open(page, '/menu', { chat });
  await button(page).click();
  const sheet = page.getByRole('dialog', { name: 'Lytro সাপোর্ট' });
  await expect(sheet.getByText(/থেকে .* পর্যন্ত উত্তর দিই/)).toBeVisible();
  await expect(
    sheet.getByText('একটু ব্যস্ত আছি — শিগগিরই উত্তর দিচ্ছি। জরুরি হলে WhatsApp করুন।'),
  ).toBeVisible();
});

test('the button hides while the page scrolls and comes back after', async ({ page }) => {
  await open(page, '/menu', { chat: drawnChat() });
  await expect(button(page)).toHaveAttribute('data-shown', 'true');
  // A scroll anywhere on the page, as the button listens for it.
  await page.evaluate(() => {
    document.dispatchEvent(new Event('scroll'));
  });
  await expect(button(page)).toHaveAttribute('data-shown', 'false');
  await expect(button(page)).toHaveAttribute('data-shown', 'true', { timeout: 4_000 });
});
