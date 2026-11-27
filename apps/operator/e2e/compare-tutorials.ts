import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { fakeMp4, type FakeMp4 } from './support/fake-mp4';

// OPERATOR-CONSOLE-DESIGN §10h: the Tutorials page, each pair a screen of the sketch's "In-app tutorials" group beside
// the console showing the same. compare.spec.ts takes these. The chosen files are the sketch's own (names, sizes,
// shapes and lengths), made of just the boxes the console reads.

export interface TutorialPair {
  screen: string;
  path: string;
  only?: ('phone' | 'tablet' | 'desktop')[];
  then?: (page: Page) => Promise<void>;
}

const FOLDER = mkdtempSync(join(tmpdir(), 'lytro-tutorial-compare-'));

/** A row's button, by the part's title and the button's words in either language. */
function onRow(title: RegExp, button: RegExp): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main section > div', { hasText: title })
      .getByRole('button', { name: button })
      .click();
}

async function choose(page: Page, name: string, spec: FakeMp4): Promise<void> {
  const path = join(FOLDER, name);
  writeFileSync(path, fakeMp4(spec));
  await page
    .getByRole('dialog')
    .getByLabel(/^(Choose a file|ফাইল সিলেক্ট করুন)$/)
    .setInputFiles(path);
  await page
    .getByRole('dialog')
    .getByText(/1080 × 1920|1920 × 1080/)
    .first()
    .waitFor();
}

const CAMPAIGN = /(Part 6b · Ad campaign|পর্ব ৬খ · অ্যাড ক্যাম্পেইন)/;
const PRODUCT = /(Part 3 · Adding a product|পর্ব ৩ · প্রোডাক্ট যোগ)/;
const STEADFAST = /(Part 7 · Steadfast|পর্ব ৭ · Steadfast)/;
const GOOD = { width: 1080, height: 1920, seconds: 155, mb: 21 };

async function upload(page: Page): Promise<void> {
  await onRow(CAMPAIGN, /^(Upload|আপলোড)$/)(page);
  await choose(page, 'ad-campaign-final.mp4', GOOD);
}

async function replace(page: Page): Promise<void> {
  await onRow(PRODUCT, /^(Replace|বদলান)$/)(page);
  await choose(page, 'add-product-new.mp4', { width: 1080, height: 1920, seconds: 200, mb: 24 });
}

const send = (words: RegExp) => async (page: Page) => {
  await page.getByRole('dialog').getByRole('button', { name: words }).click();
  await page.getByRole('status').first().waitFor();
};

export const TUTORIAL_PAIRS: TutorialPair[] = [
  { screen: 'tv-tutorials', path: '/tutorials', only: ['desktop', 'phone'] },
  { screen: 'tv-upload', path: '/tutorials', only: ['desktop'], then: upload },
  {
    screen: 'tv-upload-bad',
    path: '/tutorials',
    only: ['desktop'],
    then: async (page) => {
      await onRow(CAMPAIGN, /^(Upload|আপলোড)$/)(page);
      await choose(page, 'ad-campaign-youtube.mp4', {
        width: 1920,
        height: 1080,
        seconds: 185,
        mb: 41,
      });
    },
  },
  {
    screen: 'tv-uploaded',
    path: '/tutorials',
    only: ['desktop'],
    then: async (page) => {
      await upload(page);
      await send(/(Upload and make it live|আপলোড করে লাইভ করুন)/)(page);
    },
  },
  { screen: 'tv-replace', path: '/tutorials', only: ['desktop'], then: replace },
  {
    screen: 'tv-replaced',
    path: '/tutorials',
    only: ['desktop'],
    then: async (page) => {
      await replace(page);
      await send(/(Replace and make it live|বদলে লাইভ করুন)/)(page);
    },
  },
  {
    screen: 'tv-remove',
    path: '/tutorials',
    only: ['desktop'],
    then: onRow(STEADFAST, /^(Remove|সরান):/),
  },
  {
    screen: 'tv-preview',
    path: '/tutorials',
    only: ['desktop'],
    then: onRow(PRODUCT, /^(Watch|দেখুন)$/),
  },
];
