import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// D3-4: the media Worker's tests run inside the Workers runtime (Miniflare), with its store, cache and settings
// simulated locally; nothing reaches Cloudflare.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          R2_ENDPOINT: 'https://r2.example.test',
          R2_ACCESS_KEY_ID: 'test-access-key',
          R2_SECRET_ACCESS_KEY: 'test-secret-key',
          MEDIA_LINK_SECRET: 'test-link-secret',
          DASHBOARD_ORIGINS: 'https://app.lytro.test',
        },
      },
    }),
  ],
});
