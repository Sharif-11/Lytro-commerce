import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    // Generates routes/route-tree.gen.ts from the routes/ folder before react() transforms anything.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    commonjsOptions: {
      // @lytronix/validators builds as CommonJS (apps/server needs that, via require()) — Vite's default
      // commonjs matching only looks under node_modules/**, but pnpm's workspace symlink resolves to
      // packages/validators/dist/**, outside that pattern, so Rollup never ran its CJS→ESM interop on it.
      include: [/node_modules/, /packages[\\/]validators[\\/]/],
    },
  },
  test: {
    // jsdom, not Node: host.ts and the session holders read window.location/sessionStorage/localStorage.
    environment: 'jsdom',
  },
});
