import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates public/pwa-*.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png and favicon.ico from
// the brand's operator icon (BRAND-IDENTITY.md §8.6: teal-900 tile, marigold mark): `pnpm exec pwa-assets-generator`.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#063b38' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#063b38' } },
  },
  images: ['public/icon-source.svg'],
});
