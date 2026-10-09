import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    // Generates routes/route-tree.gen.ts from the routes/ folder before react() transforms anything.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // jsdom, not Node: host.ts and the session holders read window.location/sessionStorage/localStorage.
    environment: 'jsdom',
  },
});
