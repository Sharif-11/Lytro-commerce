import type { NextConfig } from 'next';
import path from 'node:path';

// The marketing site runs as a standard server build behind Caddy on lytro.app (docs/DEPLOYMENT.md §8). It
// never forwards /api: plan data is read server-side from SERVER_URL with the edge secret (§5, §6).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Slice 9.1: the image build sets NEXT_STANDALONE=1, so the build carries its own server and only the packages it uses
  // (`.next/standalone`); development, CI and `next start` keep the standard build.
  ...(process.env['NEXT_STANDALONE'] === '1' ? { output: 'standalone' as const } : {}),
  // The monorepo root, so file tracing follows workspace packages and never a stray lockfile above the repo.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    // Every image on the site is a local SVG or PNG in /public; nothing is loaded from another host.
    remotePatterns: [],
  },
  // Slice 9.8: the terms and privacy texts (src/content/legal/*.md) are imported as plain strings and built into the
  // pages, so a deployment needs no files beside the build. src/types/markdown.d.ts types them; vitest.config.ts reads
  // them the same way.
  webpack: (config: { module: { rules: unknown[] } }) => {
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });
    return config;
  },
};

export default nextConfig;
