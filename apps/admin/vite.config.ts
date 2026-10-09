import path from 'node:path';
import { defineConfig } from 'vitest/config';
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
      manifest: {
        name: 'Lytro',
        short_name: 'Lytro',
        description: 'Run your shop from your phone — Lytro commerce.',
        lang: 'bn',
        theme_color: '#0d9488',
        background_color: '#f8fafc',
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
      // packages/validators/dist/**, outside that pattern, so Rollup never ran its CJS→ESM interop on it.
      include: [/node_modules/, /packages[\\/]validators[\\/]/],
    },
  },
  optimizeDeps: {
    // Same CJS/symlink mismatch as build.commonjsOptions above, but for the dev server: esbuild only
    // prebundles (and CJS→ESM-converts) deps it discovers under node_modules/**.
    include: ['@lytronix/validators'],
  },
  server: {
    proxy: {
      // Mirrors Caddy's production rule (docs/DEPLOYMENT.md §5): strip /api, forward to the backend. Without
      // this, ApiClient's same-origin '/api/...' fetches hit the Vite dev server itself and get its SPA
      // fallback HTML back, not the backend's JSON.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    // jsdom, not Node: host.ts and the session holders read window.location/sessionStorage/localStorage.
    environment: 'jsdom',
  },
});
