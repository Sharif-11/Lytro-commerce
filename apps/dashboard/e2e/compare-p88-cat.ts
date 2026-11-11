import type { Page } from '@playwright/test';
import type { Language, ShopState } from './support/mock-api';
import { gripOf, holdOver, p88Tree, refuseMoves } from './support/p88-cat-mock';

// TENANT-DASHBOARD-DESIGN §7.41 (Slice 8.8, D8-72): categories by dragging, each pair a screen of the sketch's "Phase 8 ·
// Slice 8.8" group beside the dashboard showing the same, over the sketch's tree. A computer's are held mid-drag as
// drawn; a phone's open its ⋯ menu and Move to…. compare.spec.ts takes these.

export interface P88CatPair {
  name: string;
  screen: string;
  device: 'phone' | 'desktop';
  language: Language;
  path: string;
  state?: ShopState;
  then?: (page: Page) => Promise<void>;
}

const one = (
  screen: string,
  then?: (page: Page) => Promise<void>,
  device: 'phone' | 'desktop' = 'desktop',
  language: Language = 'en',
): P88CatPair => ({
  name: screen,
  screen,
  device,
  language,
  path: '/categories',
  state: { products: p88Tree() },
  ...(then ? { then } : {}),
});

/** A phone's ⋯ menu for Kids, in Bangla. */
async function kidsMenu(page: Page): Promise<void> {
  await page.getByRole('main').getByRole('button', { name: 'কিডস: আরও' }).click();
}

export const P88_CAT_PAIRS: P88CatPair[] = [
  one('p88-cat'),
  one('p88-cat', undefined, 'phone', 'bn'),
  one('p88-cat-into', (page) => holdOver(page, 'Kids', 'T-shirts', 0.5)),
  one('p88-cat-between', (page) => holdOver(page, 'Kids', 'Sarees', 0.1)),
  one('p88-cat-deep', (page) => holdOver(page, 'Kids', 'Slim fit', 0.5)),
  one('p88-cat-self', (page) => holdOver(page, 'T-shirts', 'Formal', 0.5)),
  one('p88-cat-moved', async (page) => {
    await holdOver(page, 'Kids', 'T-shirts', 0.5);
    await page.mouse.up();
    await page.getByRole('status').filter({ hasText: 'Kids is now inside T-shirts' }).waitFor();
  }),
  one('p88-cat-keys', async (page) => {
    await gripOf(page, 'Kids').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
  }),
  one('p88-cat-failed', async (page) => {
    await refuseMoves(page);
    await holdOver(page, 'Kids', 'Sarees', 0.1);
    await page.mouse.up();
    await page.getByText('Not moved: someone changed the categories meanwhile.').waitFor();
  }),
  one('p88-cat-menu', kidsMenu, 'phone', 'bn'),
  one(
    'p88-cat-moveto',
    async (page) => {
      await kidsMenu(page);
      await page.getByRole('dialog').getByRole('button', { name: 'অন্য জায়গায় সরান…' }).click();
      await page.getByRole('dialog').getByRole('radio', { name: 'টি-শার্ট' }).click();
    },
    'phone',
    'bn',
  ),
];
