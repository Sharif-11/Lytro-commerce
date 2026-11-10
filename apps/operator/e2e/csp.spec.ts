import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { RAHIM, REVIEW_RENEWAL } from './support/console-data';
import { mockApi } from './support/mock-api';
import { UPLOAD_ORIGIN, withBankAccount } from './support/p88-money-mock';

// The console under its own Content Security Policy, read from deploy/Caddyfile's `(operator_csp)` block -- the one
// definition Caddy serves -- and sent with every page as Caddy sends it. Every screen of the route tree loads with nothing
// refused. The policy does not depend on the screen size, so it is checked once, in the desktop project.

const root = (...parts: string[]) => resolve(import.meta.dirname, '..', ...parts);

function policy(): string {
  const caddyfile = readFileSync(root('../../deploy/Caddyfile'), 'utf8').replaceAll('\r\n', '\n');
  const found = /\n\(operator_csp\) \{\n\s*header Content-Security-Policy "([^"]+)"/.exec(
    caddyfile,
  );
  if (!found?.[1]) throw new Error('No (operator_csp) block in deploy/Caddyfile');
  // The storage's address is the server's own setting, which Caddy fills in; the mocked storage stands in.
  return found[1].replaceAll('{$MEDIA_STORAGE_ENDPOINT}', UPLOAD_ORIGIN);
}

function everyPath(): string[] {
  const tree = readFileSync(root('src/routeTree.gen.ts'), 'utf8');
  const byFullPath = /export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/.exec(tree)?.[1] ?? '';
  return [
    ...new Set(
      [...byFullPath.matchAll(/^\s+'(\/[^']*)': typeof /gm)].map(([, path = '']) =>
        path.length > 1 ? path.replace(/\/$/, '') : path,
      ),
    ),
  ];
}

async function underPolicy(page: Page): Promise<() => Promise<string[]>> {
  const value = policy();
  await page.addInitScript(() => {
    const refused: string[] = [];
    (window as unknown as { refused: string[] }).refused = refused;
    document.addEventListener('securitypolicyviolation', (event) => {
      refused.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': value },
    });
  });
  return () => page.evaluate(() => (window as unknown as { refused?: string[] }).refused ?? []);
}

test.skip(() => test.info().project.name !== 'desktop', 'One screen size is enough for a policy');

test('every screen loads with nothing refused', async ({ page }) => {
  test.slow();
  const refused = await underPolicy(page);
  await mockApi(page);
  const paths = everyPath();
  expect(paths.length).toBeGreaterThan(20);
  const found: string[] = [];
  for (const path of paths) {
    await page.goto('about:blank');
    await page.goto(path.replace('$id', path.startsWith('/queue') ? REVIEW_RENEWAL : RAHIM));
    await page.waitForLoadState('networkidle');
    if ((await page.locator('#root > *').count()) === 0) found.push(`${path}: nothing drawn`);
    for (const each of await refused()) found.push(`${path}: ${each}`);
  }
  expect(found).toEqual([]);
});

test('the enrol step draws its QR code under the policy', async ({ page }) => {
  const refused = await underPolicy(page);
  await mockApi(page, { signedIn: false, enrolled: false });
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('ops@lytro.app');
  await page.getByLabel('Password').fill('the-right-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
  expect(await refused()).toEqual([]);
});

// ADM-14, ADM-17 (Slice 8.8): a payment screenshot goes up to the storage's signed link and shows from its five-minute
// link, both on the storage's own address.
test('a payment screenshot uploads to the storage and shows from it under the policy', async ({
  page,
}) => {
  const refused = await underPolicy(page);
  await mockApi(page, { paymentMethods: withBankAccount() });
  // A real picture from the storage, so the screenshot's link draws.
  await page.route(`${UPLOAD_ORIGIN}/shot.png`, (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('**/api/v1/operator/payment-queue/*/evidence', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        statusCode: 200,
        message: 'OK',
        data: { url: `${UPLOAD_ORIGIN}/shot.png`, expiresAt: '2026-10-21T08:35:00.000Z' },
      }),
    }),
  );

  await page.goto('/manual');
  await page.getByRole('main').getByRole('button', { name: 'Record a payment' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('searchbox').fill('Sadia');
  await panel.getByRole('button', { name: /^Sadia Collection/ }).click();
  const sent = page.waitForRequest(
    (request) => request.url().startsWith(UPLOAD_ORIGIN) && request.method() === 'PUT',
  );
  await panel.locator('input[type=file]').setInputFiles({
    name: 'bkash.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(2048, 1),
  });
  await sent;
  await expect(panel.getByText('bkash.jpg')).toBeVisible();

  await page.goto(`/queue/${REVIEW_RENEWAL}?step=screenshot`);
  const shot = page.getByRole('dialog').locator(`img[src^="${UPLOAD_ORIGIN}"]`);
  await expect(shot).toBeVisible();
  await expect.poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
  expect(await refused()).toEqual([]);
});
