import { defineConfig } from '@playwright/test';

// Slice 5.8's part 2: the payment page in a real browser, drawn from fixtures by test/pay-page-browser/serve.ts.
const PORT = 4190;

export default defineConfig({
  testDir: './test/pay-page-browser',
  testMatch: '*.pw.ts',
  outputDir: './test-results/pay-page',
  // One server holding one fixture, which each test sets.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'line',
  use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
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
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 820 } } },
  ],
  webServer: {
    command: 'pnpm exec tsx test/pay-page-browser/serve.ts',
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
