import { defineConfig } from '@playwright/test';

// TENANT-DASHBOARD-DESIGN §11: the dashboard's screens in a real browser, against a mocked API (e2e/support), on a
// phone and a desktop, in Bangla and English. They run against the built app (`pnpm build` first, with
// VITE_SUPPORT_WHATSAPP=8801000000000 for the Menu's Help row), as CI does.
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: 'bn-BD',
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
