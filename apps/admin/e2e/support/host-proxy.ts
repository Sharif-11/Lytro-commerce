import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import path from 'node:path';

/**
 * Mirrors Caddy's production rule for a single host (docs/DEPLOYMENT.md §5) just enough for Playwright:
 * one origin, `/api/*` stripped and forwarded to the backend with the browser's own Host header preserved
 * (never rewritten the way a dev-mode `changeOrigin: true` proxy would), everything else served from the
 * admin SPA's build with an `index.html` fallback for the client-side router. This is why it exists as its
 * own tiny server instead of reusing vite's dev proxy: that proxy sets `changeOrigin: true` for normal
 * local development (deliberately, see vite.config.ts), which would make every request look like it came
 * from `localhost` regardless of which tenant subdomain the browser actually used — exactly the one thing
 * these E2E tests need to tell apart.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function startHostProxy(
  distDir: string,
  backendPort: number,
  proxyPort: number,
): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/api/')) {
      const proxied = httpRequest(
        {
          host: '127.0.0.1',
          port: backendPort,
          path: url.replace(/^\/api/, '') || '/',
          method: req.method,
          headers: req.headers, // includes the original Host — the whole point of this file
        },
        (backendRes) => {
          res.writeHead(backendRes.statusCode ?? 502, backendRes.headers);
          backendRes.pipe(res);
        },
      );
      proxied.on('error', (error) => {
        res.writeHead(502).end(`backend proxy error: ${error.message}`);
      });
      req.pipe(proxied);
      return;
    }

    const requested = path.join(distDir, decodeURIComponent(url.split('?')[0] ?? ''));
    const filePath =
      existsSync(requested) && statSync(requested).isFile()
        ? requested
        : path.join(distDir, 'index.html');
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(proxyPort, '0.0.0.0', () => {
      resolve(server);
    });
  });
}
