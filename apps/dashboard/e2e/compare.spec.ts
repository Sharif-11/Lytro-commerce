import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type Page } from '@playwright/test';
import { mockApi, SLUG, type Language } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §11: each built screen beside the prototype's drawing of it, at the prototype's own frame
// sizes, saved to test-results/compare for the pull request and CI's artifacts. No pixel baseline is committed: a
// font renders a little differently on Windows and Linux, so the pictures are for a person to compare.
const PROTOTYPE = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/brand/lytro-dashboard.html'),
).href;

type Device = 'phone' | 'tablet' | 'desktop';

// The area the prototype's frame gives its shell: the frame less its border, and the phone's status bar or the
// desktop's address bar (the tablet frame has neither).
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 784 },
  tablet: { width: 804, height: 984 },
  desktop: { width: 1280, height: 778 },
};

interface Pair {
  name: string;
  screen: string;
  device: Device;
  language: Language;
  path: string;
  /** What to do in the app once the page shows, before the picture (opening the + menu). */
  then?: (page: Page) => Promise<void>;
}

const PAIRS: Pair[] = [
  { name: 'orders', screen: 'orders-soon', device: 'phone', language: 'bn', path: '/orders' },
  { name: 'orders', screen: 'orders-soon', device: 'tablet', language: 'bn', path: '/orders' },
  { name: 'orders', screen: 'orders-soon', device: 'desktop', language: 'en', path: '/orders' },
  {
    name: 'search',
    screen: 'search-products',
    device: 'phone',
    language: 'bn',
    path: `/search?q=${encodeURIComponent('জ্যাকেট')}`,
  },
  {
    name: 'plus',
    screen: 'plus',
    device: 'phone',
    language: 'bn',
    path: '/orders',
    then: async (page) => {
      await page.getByRole('button', { name: 'নতুন' }).click();
    },
  },
  { name: 'shop-chrome', screen: 'products', device: 'desktop', language: 'bn', path: '/products' },
];

test.describe('the built shell beside the prototype', () => {
  for (const pair of PAIRS) {
    test(`${pair.name} on a ${pair.device} in ${pair.language}`, async ({ browser }) => {
      // The pictures set their own sizes, so they are taken once, not in every project.
      test.skip(test.info().project.name !== 'desktop', 'taken once, in the desktop project');
      const out = `test-results/compare/${pair.name}-${pair.device}-${pair.language}`;

      const drawing = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
      await drawing.goto(PROTOTYPE);
      await drawing.click(`#segLang button[data-v="${pair.language}"]`);
      await drawing.click(`#segDevice button[data-v="${pair.device}"]`);
      await drawing.selectOption('#selScreen', pair.screen);
      await drawing.waitForTimeout(400);
      await drawing.locator('#frame .shell').screenshot({ path: `${out}-prototype.png` });
      await drawing.close();

      const app = await browser.newPage({ viewport: AREA[pair.device] });
      await mockApi(app, { language: pair.language });
      await app.goto(`/${SLUG}${pair.path}`);
      await app.waitForLoadState('networkidle');
      await app.evaluate(() => document.fonts.ready);
      if (pair.then) await pair.then(app);
      await app.waitForTimeout(300);
      await app.screenshot({ path: `${out}-app.png` });
      await app.close();
    });
  }
});
