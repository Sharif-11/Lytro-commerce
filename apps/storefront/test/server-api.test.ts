import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServerApi } from '../src/lib/api/server-api';

// Slice 9.10: a busy server's wait reaches the storefront from the real answer's Retry-After header, over HTTP.
let server: Server;
let address = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/v1/busy') {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '9' });
      response.end(JSON.stringify({ success: false, errors: { code: 'rate_limited' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: { name: 'Megh' } }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  address = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    }),
);

describe('ServerApi (Slice 9.10)', () => {
  it('gives back the Retry-After a refusal came with', async () => {
    const answer = await new ServerApi(address).send({
      method: 'GET',
      path: '/v1/busy',
      host: 'api.lytro.app',
      headers: {},
    });
    expect(answer).toEqual({
      status: 429,
      data: null,
      code: 'rate_limited',
      details: {},
      retryAfter: '9',
    });
  });

  it('gives none when the answer names no wait', async () => {
    const answer = await new ServerApi(address).send({
      method: 'GET',
      path: '/v1/shop',
      host: 'api.lytro.app',
      headers: {},
    });
    expect(answer).toMatchObject({ status: 200, data: { name: 'Megh' }, retryAfter: null });
  });
});
