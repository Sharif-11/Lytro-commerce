import { defineConfig } from '@playwright/test';
import { MOCK_PORT, PAGE_CACHE_PORT, STOREFRONT_PORT } from './e2e/support/mock-server';

const REDIS_URL = process.env['REDIS_TEST_URL'];

// KNOWN-GAPS §105, STOREFRONT-DESIGN §11: the storefront's pages in a real browser, on a phone and a desktop, against a
// mocked server (e2e/support), as they run against the built app (`pnpm build` first), as CI does. The pages are
// rendered on the storefront's own server, so the mock is a real server it calls, and each test's shop has its own
// `<slug>.localhost`, the host naming the shop as it does in production.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/support/global-setup.ts',
  use: {
    locale: 'bn-BD',
    trace: 'retain-on-failure',
    // A registered service worker would answer from what it kept; its own behaviour is proven by unit tests.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `pnpm exec next start -p ${String(STOREFRONT_PORT)}`,
      port: STOREFRONT_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        SERVER_URL: `http://127.0.0.1:${String(MOCK_PORT)}`,
        PLATFORM_DOMAIN: 'localhost',
        // Slice 9.10: where the middleware renders a page Cloudflare's edge may keep (lib/edge).
        STOREFRONT_SELF_URL: `http://127.0.0.1:${String(STOREFRONT_PORT)}`,
      },
    },
    // D9-33: the same build with the page cache's Redis, for e2e/page-cache.spec.ts, where a Redis is given (CI's).
    ...(REDIS_URL === undefined
      ? []
      : [
          {
            command: `pnpm exec next start -p ${String(PAGE_CACHE_PORT)}`,
            port: PAGE_CACHE_PORT,
            reuseExistingServer: !process.env.CI,
            env: {
              SERVER_URL: `http://127.0.0.1:${String(MOCK_PORT)}`,
              PLATFORM_DOMAIN: 'localhost',
              STOREFRONT_SELF_URL: `http://127.0.0.1:${String(PAGE_CACHE_PORT)}`,
              PAGE_CACHE_REDIS_URL: REDIS_URL,
            },
          },
        ]),
  ],
});
