import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each e2e spec makes its own database, applies every migration and boots the app before its tests run, which
    // can pass the default 10 s on a busy machine. One limit for every spec rather than one per file.
    hookTimeout: 30_000,
    // The slowest single tests (writers racing each other, password hashing) take several seconds, too close to the
    // default 5 s. A test that needs longer still sets its own limit.
    testTimeout: 15_000,
    // Fails a spec whose code sends two queries at once on one connection (pg 9 refuses them).
    setupFiles: ['./test/support/one-query-per-connection.ts'],
    // Text is drawn with the server's own fonts and nothing else, as in its image (Dockerfile): a font file it can't
    // read draws nothing here too, instead of falling back to whatever fonts this machine has.
    env: { FONTCONFIG_FILE: fileURLToPath(new URL('./assets/fonts/fonts.conf', import.meta.url)) },
  },
});
