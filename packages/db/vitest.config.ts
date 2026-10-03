import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Creates a fresh test database and applies the migrations before any test file runs.
    globalSetup: ['./test/global-setup.ts'],
  },
});
