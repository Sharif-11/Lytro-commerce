import { defineConfig } from '@playwright/test';
import { PROXY_PORT } from './support/ports';

// A real browser against the real backend and a real Postgres (see global-setup.ts) — the admin app's
// [E2E]-tagged Phase-1 scenarios that an API-level test genuinely cannot stand in for: cookie scoping as
// the browser itself enforces it (P1-E07), and visual/DOM state split across tabs or reloads (P1-E29–E31).
// Serial on purpose: one shared backend and database for the whole run, no isolation between test files
// otherwise.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${String(PROXY_PORT)}`,
    trace: 'retain-on-failure',
  },
});
