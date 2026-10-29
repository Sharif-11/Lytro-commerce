import type { NextConfig } from 'next';
import path from 'node:path';

// The storefront runs as one server build for every shop's host (docs/DEPLOYMENT.md §8). It never forwards /api to the
// server: pages and its own route handlers call the server inside the deployment with the shop's key (SFT-11).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The monorepo root, so file tracing follows workspace packages and never a stray lockfile above the repo.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
