import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each e2e spec makes its own database, applies every migration and boots the app before its tests run, which
    // can pass the default 10 s on a busy machine. One limit for every spec rather than one per file.
    hookTimeout: 30_000,
    // The slowest single tests (writers racing each other, password hashing) take several seconds, too close to the
    // default 5 s. A test that needs longer still sets its own limit.
    testTimeout: 15_000,
  },
});
