import type { NextConfig } from 'next';
import path from 'node:path';

// CCH-10 (Slice 12c): the service worker's version, one per build, so a new build's worker drops the old one's files.
// A deployment may name it (its commit); otherwise the build's time.
const STOREFRONT_BUILD_ID = process.env['STOREFRONT_BUILD_ID'] ?? String(Date.now());

// The storefront runs as one server build for every shop's host (docs/DEPLOYMENT.md §8). It never forwards /api to the
// server: pages and its own route handlers call the server inside the deployment with the shop's key (SFT-11).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The monorepo root, so file tracing follows workspace packages and never a stray lockfile above the repo.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Every page's title and link-preview tags render in <head> before the body, for every visitor, not only the crawlers
  // Next knows (LND-05); a product link that leads nowhere then renders its 404 page as HTML too (LND-03).
  htmlLimitedBots: /.*/,
  env: { STOREFRONT_BUILD_ID },
};

export default nextConfig;
