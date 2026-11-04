import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURES, REF } from './fixtures';

// PAYMENT-PAGE-DESIGN §3, §11: every screen in a real browser, under its real policy, on a phone and a desktop, and beside
// the prototype's drawing of it, kept as pictures. The server's tests take the page through real orders. What runs in the
// browser is written as text, so the server's own compile needs no browser types.
const PROTOTYPE = `file:///${resolve(__dirname, '../../../../docs/brand/lytro-payment-page.html').replace(/\\/g, '/')}`;
const PICTURES = resolve(__dirname, '../../test-results/compare');
const SCREENS = Object.keys(FIXTURES);
const SHEETS: Readonly<Record<string, string>> = {
  details: '#details',
  report: '#report',
  'report-other': '#report',
};

async function open(page: Page, name: string, query = ''): Promise<string[]> {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') refused.push(message.text());
  });
  page.on('pageerror', (error) => refused.push(error.message));
  await page.request.get(`/__fixture?name=${name}`);
  // Not to the load event: the handing-over screen is already posting by then.
  await page.goto(`/${REF}${query}${SHEETS[name] ?? ''}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate('document.fonts.ready.then(() => true)');
  return refused;
}

for (const name of SCREENS) {
  test(`${name}: nothing is refused, nothing overflows, nothing unfinished shows`, async ({
    page,
  }) => {
    const refused = await open(page, name);
    await page.setViewportSize({ width: 320, height: 616 });
    const measured = await page.evaluate<{ wide: number; text: string }>(
      // Against 320 itself: on a phone the browser widens its viewport to fit whatever is too wide.
      '({ wide: document.documentElement.scrollWidth - 320, text: document.body.innerText })',
    );
    expect(refused, 'the policy or the script refused something').toEqual([]);
    expect(measured.wide, 'wider than a 320 px phone').toBeLessThanOrEqual(0);
    expect(measured.text).not.toMatch(/\{[a-z]\}/);
    expect(measured.text, 'figures are Western digits').not.toMatch(/[০-৯]/);
  });

  test(`${name}: passes the accessibility checks`, async ({ page }) => {
    await open(page, name);
    const { violations } = await new AxeBuilder({ page })
      .disableRules(['landmark-one-main', 'region'])
      .analyze();
    expect(violations.map((row) => `${row.id}: ${row.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
}

// The prototype opened once and walked: its fonts come from Google, which a run shouldn't wait on 276 times.
test('every screen, beside the drawing', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  mkdirSync(PICTURES, { recursive: true });
  const drawing = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await drawing.goto(PROTOTYPE);
  await drawing.waitForTimeout(800);
  for (const name of SCREENS) {
    for (const language of ['bn', 'en']) {
      await open(page, name, language === 'en' ? '?lang=en' : '');
      const label = `${name}-${language}-${info.project.name}`;
      await page.screenshot({ path: `${PICTURES}/${label}-app.png` });
      // The prototype's own functions are its script's, not the window's, so this runs as text in its scope.
      await drawing.evaluate(
        `setLang('${language}'); ST.device = '${info.project.name}'; go('${name}');`,
      );
      await drawing.evaluate(
        'Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => true)',
      );
      await drawing.locator('#frame').screenshot({ path: `${PICTURES}/${label}-sketch.png` });
    }
  }
  await drawing.close();
});

test.describe('what the small script adds', () => {
  test('copies exactly the number, and says so (PAY-05)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'bkash');
    await page.locator('[data-copy]').first().click();
    await expect(page.locator('#copied')).toContainText('01712345678');
    expect(await page.evaluate('navigator.clipboard.readText()')).toBe('01712345678');
  });

  test('runs the time left down', async ({ page }) => {
    await open(page, 'bkash');
    const clock = page.locator('[data-expires]').first();
    const before = await clock.innerText();
    await expect(clock).not.toHaveText(before, { timeout: 3000 });
  });

  test('sees a verified payment within 3 seconds and returns to the shop (PAY-08, PAY-17)', async ({
    page,
  }) => {
    await open(page, 'checking-late');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'late');
    await page.request.get('/__fixture?name=verified');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'verified', {
      timeout: 4500,
    });
    expect(page.url()).toContain('just=1');
    await expect(page.locator('body')).toHaveAttribute('data-return', /^https:\/\/megh/);
  });
});

test.describe('without any script at all', () => {
  test.use({ javaScriptEnabled: false });

  test('a waiting page still refreshes itself, and the form still posts', async ({ page }) => {
    await page.request.get('/__fixture?name=manual');
    await page.goto(`/${REF}`);
    await expect(page.locator('noscript').first()).toBeAttached();
    await page.request.get('/__fixture?name=bkash');
    await page.goto(`/${REF}`);
    await expect(page.locator('form#payform')).toHaveAttribute('method', 'post');
    await expect(page.locator('button[form="payform"]')).toBeVisible();
  });

  test('the sheets still open, and choosing something else asks for a note', async ({ page }) => {
    await page.request.get('/__fixture?name=bkash');
    await page.goto(`/${REF}`);
    await expect(page.locator('#report .sheet')).toBeHidden();
    await page.locator('a[href="#report"]').click();
    await expect(page.locator('#report .sheet')).toBeVisible();
    await expect(page.locator('.rnote')).toBeHidden();
    await page.locator('label[for="r-other"]').click();
    await expect(page.locator('.rnote')).toBeVisible();
  });

  test('the language link switches every word and keeps the wallet (PAY-22)', async ({ page }) => {
    await page.request.get('/__fixture?name=pick');
    await page.goto(`/${REF}?w=nagad`);
    await page.locator('a', { hasText: 'English' }).click();
    expect(page.url()).toContain('lang=en');
    expect(page.url()).toContain('w=nagad');
    await expect(page.locator('.vbtn')).toHaveText(/VERIFY TRANSACTION/);
  });
});
