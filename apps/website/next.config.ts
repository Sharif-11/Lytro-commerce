import type { NextConfig } from 'next';
import path from 'node:path';

// The marketing site runs as a standard server build behind Caddy on lytro.app (docs/DEPLOYMENT.md §8). It
// never forwards /api: plan data is read server-side from SERVER_URL with the edge secret (§5, §6).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The monorepo root, so file tracing follows workspace packages and never a stray lockfile above the repo.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    // Every image on the site is a local SVG or PNG in /public; nothing is loaded from another host.
    remotePatterns: [],
  },
};

export default nextConfig;
