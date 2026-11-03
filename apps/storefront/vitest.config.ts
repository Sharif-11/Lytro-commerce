import { configDefaults, defineConfig } from 'vitest/config';

// The unit tests; `e2e` is Playwright's, run by `pnpm test:e2e` against the built app.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
