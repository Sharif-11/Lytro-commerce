import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiClientError } from '../src';

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function stubFetch(response: Response): { headers: () => Headers; init: () => RequestInit } {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  const init = (): RequestInit => (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined) ?? {};
  return { init, headers: () => new Headers(init().headers) };
}

const ok = (data: unknown) => reply(200, { success: true, statusCode: 200, message: 'ok', data });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a request', () => {
  it('sends cookies, unwraps the data, and adds the CSRF token only to a change', async () => {
    const read = stubFetch(ok({ id: 1 }));
    const client = new ApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'token' });
    expect(await client.get('/me')).toEqual({ id: 1 });
    expect(read.init().credentials).toBe('include');
    expect(read.headers().get('x-csrf-token')).toBeNull();
    vi.unstubAllGlobals();

    const change = stubFetch(ok({}));
    await client.patch('/shop-settings', { businessAddress: 'Mirpur' });
    expect(change.init().method).toBe('PATCH');
    expect(change.init().body).toBe('{"businessAddress":"Mirpur"}');
    expect(change.headers().get('x-csrf-token')).toBe('token');
  });

  it('names the shop the page gives it, read at call time (TEN-31)', async () => {
    let shop: string | null = 'megh';
    const client = new ApiClient({
      baseUrl: '/api/v1',
      getCsrfToken: () => null,
      getShop: () => shop,
    });
    const first = stubFetch(ok({}));
    await client.get('/me');
    expect(first.headers().get('x-lytro-shop')).toBe('megh');
    vi.unstubAllGlobals();

    shop = null;
    const second = stubFetch(ok({}));
    await client.get('/me');
    expect(second.headers().get('x-lytro-shop')).toBeNull();
  });

  it('names no shop when the app has none to give (the operator console)', async () => {
    const sent = stubFetch(ok({}));
    await new ApiClient({ baseUrl: '/api/v1', getCsrfToken: () => null }).delete('/x');
    expect(sent.headers().get('x-lytro-shop')).toBeNull();
    expect(sent.init().method).toBe('DELETE');
  });
});

describe('a refusal', () => {
  it("carries the server's code, message, details and Retry-After", async () => {
    stubFetch(
      reply(
        429,
        {
          success: false,
          statusCode: 429,
          message: 'Too many.',
          errors: { code: 'rate_limited', details: {} },
        },
        { 'Retry-After': '90' },
      ),
    );
    const client = new ApiClient({ baseUrl: '', getCsrfToken: () => null });
    const error = await client.get('/x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'rate_limited',
      message: 'Too many.',
      status: 429,
      retryAfterSeconds: 90,
    });
  });

  it('falls back to service_unavailable with no message when the body does not parse', async () => {
    stubFetch(new Response('<html>', { status: 502 }));
    const error = await new ApiClient({ baseUrl: '', getCsrfToken: () => null })
      .get('/x')
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'service_unavailable', message: '', status: 502 });
  });

  it("reads each field's message from the list the server sends (API-16)", () => {
    const error = new ApiClientError(
      'validation_error',
      '2 fields need fixing. Check the highlighted fields.',
      {
        fields: [
          { field: 'shopName', problem: 'too_long', max: 60, message: 'Shop name is too long.' },
          { field: 'ownerName', problem: 'required', message: 'Your name is required.' },
          { field: 'broken' },
        ],
      },
      400,
    );
    expect(error.fieldProblems()).toEqual({
      shopName: 'Shop name is too long.',
      ownerName: 'Your name is required.',
    });
    expect(new ApiClientError('validation_error', '', {}, 400).fieldProblems()).toEqual({});
  });
});
