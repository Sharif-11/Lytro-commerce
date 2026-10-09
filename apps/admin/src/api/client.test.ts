import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiClientError } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function lastRequestInit(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): RequestInit {
  const call = fetchMock.mock.calls.at(-1);
  if (!call?.[1]) throw new Error('fetch was not called with an init object');
  return call[1];
}

describe('ApiClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends cookies and skips the CSRF header on GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => 'csrf-123' });

    await client.get('/me');

    const init = lastRequestInit(fetchMock);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/me');
    expect(init.credentials).toBe('include');
    expect((init.headers as Headers).has('x-csrf-token')).toBe(false);
  });

  it('attaches the CSRF header on POST when a token is available', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => 'csrf-123' });

    await client.post('/sign-in', { phone: '+8801...' });

    const init = lastRequestInit(fetchMock);
    expect((init.headers as Headers).get('x-csrf-token')).toBe('csrf-123');
    expect(init.body).toBe(JSON.stringify({ phone: '+8801...' }));
  });

  it('omits the CSRF header on POST when no token is set yet', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => null });

    await client.post('/sign-in', {});

    const init = lastRequestInit(fetchMock);
    expect((init.headers as Headers).has('x-csrf-token')).toBe(false);
  });

  it('returns undefined for a 204 response without reading the body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => null });

    await expect(client.post('/sign-out')).resolves.toBeUndefined();
  });

  it('throws an ApiClientError built from the server error envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'rate_limited',
            message: 'Too many attempts',
            details: { retryInSeconds: 30 },
          },
        },
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } },
      ),
    );
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => null });

    await expect(client.get('/me')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiClientError);
      const clientError = error as ApiClientError;
      expect(clientError.code).toBe('rate_limited');
      expect(clientError.message).toBe('Too many attempts');
      expect(clientError.status).toBe(429);
      expect(clientError.retryAfterSeconds).toBe(30);
      return true;
    });
  });

  it('falls back to a generic error when the response body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 503 }));
    const client = new ApiClient({ baseUrl: '/api', getCsrfToken: () => null });

    await expect(client.get('/me')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiClientError);
      const clientError = error as ApiClientError;
      expect(clientError.code).toBe('service_unavailable');
      expect(clientError.retryAfterSeconds).toBeUndefined();
      return true;
    });
  });
});
