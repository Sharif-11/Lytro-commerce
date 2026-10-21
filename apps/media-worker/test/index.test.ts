import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { MEDIA_BLOCKED_KEY } from '@lytronix/shared-types';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { SHOP } from './fakes';

/** One request through the Worker as deployed, with its bindings and settings from wrangler.jsonc. */
async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  // As the runtime hands it over: an incoming request.
  const request = new Request(`https://media.lytro.test${path}`, init) as Request<
    unknown,
    IncomingRequestCfProperties
  >;
  const response = await worker.fetch(request, env, ctx);
  await response.arrayBuffer();
  await waitOnExecutionContext(ctx);
  return response;
}

// The Worker as wired from its bindings: the shared store, the usage dataset and its settings. Requests that need the
// store are refused before reaching it here, so nothing leaves the test.
describe('the media Worker as deployed (MED-02)', () => {
  it('answers 404 for anything that is not media', async () => {
    expect((await fetchWorker('/')).status).toBe(404);
    expect((await fetchWorker('/tenants/nope/a.webp')).status).toBe(404);
  });

  it('reads the blocked list from its shared store', async () => {
    await env.MEDIA_EDGE.put(MEDIA_BLOCKED_KEY, JSON.stringify({ [SHOP]: 'bandwidth' }));
    const refused = await fetchWorker(`/tenants/${SHOP}/m1/abc.webp`);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('x-quota')).toBe('bandwidth');
  });

  it('refuses every method but reading', async () => {
    const put = await fetchWorker(`/tenants/${SHOP}/m1/abc.webp`, { method: 'PUT', body: 'x' });
    expect(put.status).toBe(405);
    expect(put.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });
});
