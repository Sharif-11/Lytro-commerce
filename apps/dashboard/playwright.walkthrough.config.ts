import { defineConfig } from '@playwright/test';
import { DASHBOARD_PORT, SERVER_PORT } from './walkthrough/support';

// Slice 11.13b (PHASE-3-PLAN Slice 11's "done when"): a seller of clothes, cosmetics or groceries signs up and makes a
// product, adds stock, counts it and buys more, on a phone in Bangla, against the real server and a fresh database
// (walkthrough/global-setup.ts) -- never seeing an inventory term or a field the shop type does not use. It runs
// against the built app and server (`pnpm build` first) with DATABASE_TEST_ADMIN_URL set, as CI does.
const proxied: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env))
  if (value !== undefined) proxied[name] = value;
proxied['VITE_API_PROXY_TARGET'] = `http://localhost:${String(SERVER_PORT)}`;

export default defineConfig({
  testDir: './walkthrough',
  outputDir: './test-results/walkthrough',
  globalSetup: './walkthrough/global-setup.ts',
  // One server for the three walkthroughs; each signs up a shop of its own.
  workers: 1,
  timeout: 180_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/walkthrough' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${String(DASHBOARD_PORT)}`,
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
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(DASHBOARD_PORT)} --strictPort`,
    port: DASHBOARD_PORT,
    reuseExistingServer: false,
    env: proxied,
  },
});
