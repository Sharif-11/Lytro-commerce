import type { NextConfig } from 'next';
import path from 'node:path';

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
};

export default nextConfig;
