// lytro.app's link preview (BRAND-IDENTITY.md §8.6): the landing page's hero, captured in a browser at 1640x861 (the
// preview's 1.91:1) without the navigation bar, then saved at 1200x630 as apps/website/src/app/opengraph-image.png.
// A browser shapes Bangla correctly; next/og's ImageResponse (satori) doesn't ("দ োকান", "বকিাশ" in every preview).
// Re-capture after the hero changes, from the repo root (Playwright's Chromium installed):
//   node docs/brand/og-image-capture.cjs && <ffmpeg> -y -i og-capture.png -vf scale=1200:630:flags=lanczos \
//     apps/website/src/app/opengraph-image.png
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1640, height: 861 }, deviceScaleFactor: 1 });
  await page.goto(process.env.SITE || 'https://lytro.app/', { waitUntil: 'load' });
  await page.addStyleTag({
    content: `
      header.nav, section.hero svg.curve { display: none !important; }
      section.hero { height: 861px !important; min-height: 861px !important; padding: 0 !important; overflow: hidden !important; }
      section.hero > .wrap { position: absolute !important; top: 50% !important; left: 50% !important; margin: 0 !important;
        transform: translate(-50%, -50%) scale(0.92) !important; transform-origin: center center !important; }
      html, body { overflow: hidden !important; }`,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'og-capture.png', clip: { x: 0, y: 0, width: 1640, height: 861 } });
  await browser.close();
})();
