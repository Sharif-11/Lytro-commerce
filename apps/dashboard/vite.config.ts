import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    // Generates routes/route-tree.gen.ts from the routes/ folder before react() transforms anything.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      // No dev-mode service worker: vite-plugin-pwa's dev worker can keep serving a stale build after a
      // code change. Test installability with a real build: `pnpm build && pnpm preview`.
      manifest: {
        name: 'Lytro',
        short_name: 'Lytro',
        description: 'আপনার দোকান, আপনার হাতে। Run your shop from your phone.',
        lang: 'bn',
        theme_color: '#0e6b66',
        background_color: '#f6f9f8',
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
        // API calls are never cached offline — a stale /me or /auth response is worse than a network error.
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
      // @lytronix/validators builds as CommonJS (apps/server needs that, via require()) — Vite's default
      // commonjs matching only looks under node_modules/**, but pnpm's workspace symlink resolves to
      // packages/validators/dist/**, outside that pattern.
      include: [/node_modules/, /packages[\\/]validators[\\/]/],
    },
  },
  optimizeDeps: {
    include: ['@lytronix/validators'],
  },
  server: {
    proxy: {
      // Mirrors Caddy's production rule for app.lytro.app (docs/DEPLOYMENT.md §5): forward /api to the
      // backend unchanged, so ApiClient's same-origin '/api/v1/...' fetches reach it in development too.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // jsdom, not Node: the session holder reads sessionStorage and window.location.
    environment: 'jsdom',
    exclude: [...configDefaults.exclude],
  },
});
