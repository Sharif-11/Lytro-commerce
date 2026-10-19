import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiClientError } from '../src/api/client';

// TEN-31: a call from a shop's page names that shop; API-16: a refusal's field messages are read from the list the
// server sends.
function clientAt(pathname: string): { client: ApiClient; sent: () => Headers } {
  window.history.replaceState({}, '', pathname);
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, statusCode: 200, message: 'ok', data: {} }), {
      status: 200,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const client = new ApiClient({ baseUrl: '/api/v1', getCsrfToken: () => null });
  return {
    client,
    sent: () => new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shop a call names (TEN-31)', () => {
  it("names the shop of a shop's page", async () => {
    const { client, sent } = clientAt('/megh/products');
    await client.get('/me');
    expect(sent().get('x-lytro-shop')).toBe('megh');
  });

  it("names no shop on the dashboard's own pages", async () => {
    for (const page of ['/checkout', '/sign-in', '/shops', '/']) {
      const { client, sent } = clientAt(page);
      await client.get('/me');
      expect(sent().get('x-lytro-shop')).toBeNull();
      vi.unstubAllGlobals();
    }
  });
});

describe('field messages (API-16)', () => {
  it('reads each field message from the list the server sends', () => {
    const error = new ApiClientError(
      'validation_error',
      '2 fields need fixing. Check the highlighted fields.',
      {
        fields: [
          { field: 'shopName', problem: 'too_long', max: 60, message: 'Shop name is too long.' },
          { field: 'ownerName', problem: 'required', message: 'Your name is required.' },
        ],
      },
      400,
    );
    expect(error.fieldProblems()).toEqual({
      shopName: 'Shop name is too long.',
      ownerName: 'Your name is required.',
    });
  });
});
