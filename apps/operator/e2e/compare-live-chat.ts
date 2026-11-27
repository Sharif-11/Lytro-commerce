import type { Page } from '@playwright/test';
import { drawnChats, RAHIM } from './support/chat-mock';
import type { ConsoleState } from './support/mock-api';

// LIVE-CHAT-PLAN §11 (PR 1): Lytro's side of the live chat, each pair a screen of the sketch's "Live chat (sketch
// 2026-11-27)" group beside the console showing the same. compare.spec.ts takes these. The inbox on a phone (the plan's
// `oc-inbox-phone` picture) is `oc-inbox`'s own phone run. Left to PR 2, with the AI: `oc-draft` and `oc-settings-ai`,
// and the AI rows `oc-plan-features` and `oc-shop-features` draw beside the chat's.

export interface LiveChatPair {
  screen: string;
  path: string;
  state?: ConsoleState;
  then?: (page: Page) => Promise<void>;
}

/** The shop waiting with the sketch's chat, as every `oc-*` screen draws it. */
const WAITING = (): ConsoleState => ({ chats: drawnChats() });

const CHAT = `/inbox/${RAHIM}`;

/** The composer's quick replies, open. */
async function quickReplies(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Quick replies|দ্রুত উত্তর)/ }).click();
}

/** The plan editor open on Starter, its features at the top, as the sketch draws the chat's switch there. */
async function planFeatures(page: Page): Promise<void> {
  await page.getByRole('button', { name: /(Edit|এডিট) Starter/ }).click();
  await page
    .locator('dialog')
    .getByText(/^(Live chat with Lytro|Lytro-র সাথে লাইভ চ্যাট)$/)
    .first()
    .scrollIntoViewIfNeeded();
}

export const LIVE_CHAT_PAIRS: LiveChatPair[] = [
  { screen: 'oc-fab', path: '/shops', state: WAITING() },
  { screen: 'oc-inbox', path: '/inbox', state: WAITING() },
  { screen: 'oc-chat', path: CHAT, state: WAITING() },
  { screen: 'oc-quick', path: CHAT, state: WAITING(), then: quickReplies },
  { screen: 'oc-notif', path: '/account/notifications', state: WAITING() },
  { screen: 'oc-settings-chat', path: '/settings/chat', state: WAITING() },
  { screen: 'oc-plan-features', path: '/plans', state: WAITING(), then: planFeatures },
  { screen: 'oc-shop-features', path: `/shops/${RAHIM}`, state: WAITING() },
];
