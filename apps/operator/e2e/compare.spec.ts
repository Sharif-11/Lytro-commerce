import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  CODE,
  EMAIL,
  mockApi,
  PASSWORD,
  type ConsoleState,
  type Language,
} from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §17: each built screen beside the sketch's drawing of it, at the sketch's own frame sizes, saved
// to test-results/compare for the pull request and CI's artifacts. No pixel baseline is committed: a font renders a little
// differently on Windows and Linux, so the pictures are for a person to compare.
const SKETCH = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/brand/lytro-operator.html'),
).href;

const COMPARE = resolve(import.meta.dirname, '../test-results/compare');

type Device = 'phone' | 'tablet' | 'desktop';

// The area the sketch's frame gives its screens: the frame less its border, and the status bar or address bar.
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 784 },
  tablet: { width: 804, height: 940 },
  desktop: { width: 1364, height: 818 },
};

interface Pair {
  /** The sketch's screen id. */
  screen: string;
  /** Whether it is drawn without the shell. */
  bare?: boolean;
  path: string;
  state?: ConsoleState;
  /** What to do in the app before its picture. */
  then?: (page: Page) => Promise<void>;
  /** Where the screen exists, when it isn't everywhere. */
  only?: Device[];
}

async function credentials(page: Page, password = PASSWORD): Promise<void> {
  await page.locator('input[name=email]').fill(EMAIL);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

async function code(page: Page, typed: string): Promise<void> {
  await page.locator('input[name=code]').fill(typed);
  await page.locator('button[type=submit]').click();
}

const SIGNED_OUT: ConsoleState = { signedIn: false };

const PAIRS: Pair[] = [
  { screen: 'signin', bare: true, path: '/sign-in', state: SIGNED_OUT },
  {
    screen: 'signin-bad',
    bare: true,
    path: '/sign-in',
    state: SIGNED_OUT,
    then: (page) => credentials(page, 'not-the-password'),
  },
  {
    screen: 'signin-locked',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, failures: 5 },
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-verify',
    bare: true,
    path: '/sign-in',
    state: SIGNED_OUT,
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-wrong',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, failures: 1 },
    then: async (page) => {
      await credentials(page);
      await code(page, '481 900');
    },
  },
  {
    screen: 'signin-enroll',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, enrolled: false },
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-codes',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, enrolled: false },
    then: async (page) => {
      await credentials(page);
      await code(page, CODE);
    },
  },
  { screen: 'account', path: '/account' },
  {
    screen: 'account-codes',
    path: '/account',
    then: (page) => page.locator('main button').first().click(),
  },
  {
    screen: 'account-codes-done',
    path: '/account',
    then: async (page) => {
      await page.locator('main button').first().click();
      await page.locator('dialog input[name=password]').fill(PASSWORD);
      await page.locator('dialog input[name=code]').fill(CODE);
      await page.locator('dialog button[type=submit]').click();
      await page.locator('dialog li').first().waitFor();
    },
  },
  {
    screen: 'more',
    path: '/',
    then: (page) =>
      page
        .locator('button', { hasText: /^(More|আরও)$/ })
        .first()
        .click(),
    only: ['phone'],
  },
  { screen: 'later-audit', path: '/audit' },
  { screen: 'later-reports', path: '/reports' },
  { screen: 'later-manual', path: '/manual' },
];

const DEVICES: Device[] = ['phone', 'desktop', 'tablet'];
const LANGUAGES: Language[] = ['en', 'bn'];

test.skip(() => test.info().project.name !== 'desktop', 'Sets its own frame sizes');

for (const pair of PAIRS) {
  for (const device of pair.only ?? DEVICES) {
    for (const language of LANGUAGES) {
      test(`${pair.screen} on a ${device} in ${language}`, async ({ browser, baseURL }) => {
        mkdirSync(COMPARE, { recursive: true });
        const out = resolve(COMPARE, `${pair.screen}-${device}-${language}`);

        const drawn = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
        await drawn.goto(SKETCH);
        await drawn.click(`#segDevice button[data-v="${device}"]`);
        await drawn.click(`#segLang button[data-v="${language}"]`);
        await drawn.selectOption('#selScreen', pair.screen);
        await drawn.evaluate(() => document.fonts.ready);
        await drawn
          .locator(pair.bare ? '#frame .bare' : '#frame .shell')
          .screenshot({ path: `${out}-sketch.png` });
        await drawn.close();

        const context = await browser.newContext({
          baseURL,
          viewport: AREA[device],
          locale: 'en-GB',
        });
        const app = await context.newPage();
        await mockApi(app, { language, ...pair.state });
        await app.goto(pair.path);
        await expect(app.locator('#root > *').first()).toBeVisible();
        await pair.then?.(app);
        await app.waitForLoadState('networkidle');
        await app.evaluate(() => document.fonts.ready);
        await app.screenshot({ path: `${out}-app.png` });
        await context.close();
      });
    }
  }
}
