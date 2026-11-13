import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The app's own `@/` paths, for a test that reaches a component's module. A Markdown import is its text, as in the
// build (next.config.ts, the terms and privacy texts).
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    {
      name: 'markdown-as-text',
      transform(code, id) {
        return id.endsWith('.md')
          ? { code: `export default ${JSON.stringify(code)};`, map: null }
          : null;
      },
    },
  ],
});
