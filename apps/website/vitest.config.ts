import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The app's own `@/` paths, for a test that reaches a component's module.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
