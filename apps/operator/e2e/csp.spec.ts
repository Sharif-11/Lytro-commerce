import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

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
  return found[1];
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
    await page.goto(path);
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
