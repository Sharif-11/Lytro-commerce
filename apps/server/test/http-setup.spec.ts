import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEADERS_TIMEOUT_MS, HttpSetup, KEEP_ALIVE_MS } from '../src/app/http-setup';

// Staging's live run (2026-11-19): Caddy reused an idle connection the API had just closed (Node keeps one 5 seconds,
// Caddy 2 minutes), and the call came back 502, "connection reset by peer".
describe('connections from the edge', () => {
  it('are kept open longer than Caddy keeps them idle, so Caddy always closes one first', () => {
    const server = createServer();
    new HttpSetup().keepConnectionsOpen(server);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_MS);
    // Caddy's reverse proxy keeps an idle connection 2 minutes by default.
    expect(server.keepAliveTimeout).toBeGreaterThan(120_000);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });

  it('are kept as long by the storefront and the website, whose images set the same figure', () => {
    const dockerfile = readFileSync(join(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
    const figures = [...dockerfile.matchAll(/KEEP_ALIVE_TIMEOUT=(\d+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(figures).toEqual([KEEP_ALIVE_MS, KEEP_ALIVE_MS]);
  });
});
