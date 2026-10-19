import { afterEach, describe, expect, it, vi } from 'vitest';
import { shopOfPath } from '../src/session/shop-of-path';
import { TenantSession } from '../src/session/tenant-session';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shop a page belongs to (TEN-31)', () => {
  it("is the first segment of a shop's page", () => {
    expect(shopOfPath('/megh/products')).toBe('megh');
    expect(shopOfPath('/megh')).toBe('megh');
  });

  it("is none on the dashboard's own pages", () => {
    for (const page of ['/checkout', '/sign-in', '/shops', '/staff-sign-in', '/']) {
      expect(shopOfPath(page)).toBeNull();
    }
  });

  it("is named on every call the session's client makes from that page", async () => {
    window.history.replaceState({}, '', '/megh/products');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, statusCode: 200, message: 'ok', data: {} })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await new TenantSession().client.get('/me');
    const sent = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
    expect(sent.get('x-lytro-shop')).toBe('megh');
  });
});
