import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    // Generates src/routeTree.gen.ts from the routes/ folder before react() transforms anything.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      // No dev-mode service worker (see apps/dashboard/vite.config.ts for why). Test installability with a
      // real build: `pnpm build && pnpm preview`.
      manifest: {
        name: 'Lytro Operator',
        short_name: 'Operator',
        description: 'The Lytro platform operator console.',
        lang: 'en',
        theme_color: '#061211',
        background_color: '#061211',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // API calls are never cached offline: a stale queue or tenant list is worse than a network error.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    commonjsOptions: {
      // @lytronix/validators builds as CommonJS (apps/server needs that, via require()); pnpm's workspace
      // symlink resolves it outside node_modules/**, so Vite's default commonjs matching misses it.
      include: [/node_modules/, /packages[\\/]validators[\\/]/],
    },
  },
  optimizeDeps: {
    include: ['@lytronix/validators'],
  },
  server: {
    proxy: {
      // Mirrors Caddy's production rule for admin.lytro.app (docs/DEPLOYMENT.md §5): forward /api to the
      // backend unchanged, so ApiClient's same-origin '/api/v1/...' fetches reach it in development too.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // jsdom, not Node: the session holder reads sessionStorage.
    environment: 'jsdom',
    exclude: [...configDefaults.exclude],
  },
});
