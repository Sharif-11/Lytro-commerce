import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { askOf, pageHeaders } from '../../src/modules/payment-page/page/ask';
import { drawProblem, drawPage } from '../../src/modules/payment-page/page/render';
import { screenOf } from '../../src/modules/payment-page/page/screens';
import { dataOf, FIXTURES, REF } from './fixtures';

// The page's own drawing, from fixtures, with its real headers and files: what its browser tests look at. The server's own
// tests (test/payment-page-html.e2e.spec.ts) take it from real orders; these look at it in a real browser.
export const PORT = 4190;
const ASSETS = join(__dirname, '..', '..', 'assets', 'pay');
const ASSET_URLS = { css: '/assets/page.css', js: '/assets/page.js' };
const TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

let current = 'pick';

function send(
  response: ServerResponse,
  status: number,
  type: Record<string, string>,
  body: string | Buffer,
): void {
  response.writeHead(status, type);
  response.end(body);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${String(PORT)}`);
  if (url.pathname === '/__fixture') {
    current = url.searchParams.get('name') ?? 'pick';
    send(response, 200, { 'Content-Type': 'text/plain' }, 'ok');
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const name = normalize(url.pathname.slice('/assets/'.length));
    const type = TYPES[extname(name)];
    if (type === undefined) {
      send(response, 404, { 'Content-Type': 'text/plain' }, 'no');
      return;
    }
    send(response, 200, { 'Content-Type': type }, readFileSync(join(ASSETS, name)));
    return;
  }
  const query = Object.fromEntries(url.searchParams);
  const asked = askOf(query);
  const headers = pageHeaders(undefined);
  if (url.pathname === '/__problem/suspended' || url.pathname === '/__problem/missing') {
    const problem = url.pathname.endsWith('suspended') ? 'suspended' : 'missing';
    send(response, 200, headers, drawProblem(problem, asked.language, ASSET_URLS));
    return;
  }
  const fixture = FIXTURES[current] ?? {};
  const now = new Date();
  const ask = { ...asked, ...fixture.ask };
  const data = dataOf(current, now, ask.language);
  if (url.pathname === `/${REF}/status`) {
    send(
      response,
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({ screen: screenOf(data, ask, now) }),
    );
    return;
  }
  // Sending itself on is the server's tests' to prove: here the handing-over screen stays to be looked at.
  const page = drawPage(data, ask, now, ASSET_URLS, fixture.options ?? {});
  send(response, 200, headers, page.replace(' data-auto="1"', ''));
}).listen(PORT);
