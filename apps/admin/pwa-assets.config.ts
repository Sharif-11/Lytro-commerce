import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// One-time asset generation from public/logo.svg into public/icons/ — run via
// `npx pwa-assets-generator` whenever the source logo changes, not on every build.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
});
