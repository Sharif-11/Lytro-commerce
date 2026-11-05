import { defineConfig } from '@playwright/test';

// OPERATOR-CONSOLE-DESIGN §17: the console's screens in a real browser, against a mocked API (e2e/support), on a phone and
// a desktop, in English and Bangla. They run against the built app (`pnpm build` first), as CI does.
const PORT = 4175;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: 'en-GB',
    // The console's service worker would answer before the mocked API could.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
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
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
