import { describe, expect, it } from 'vitest';
import {
  KEPT_PATHS,
  SITE_EDGE_TAG,
  SiteEdgePolicy,
  type SiteRequest,
} from '../src/lib/edge/site-edge';

const policy = new SiteEdgePolicy();

function request(
  overrides: Partial<SiteRequest> & {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): SiteRequest {
  const { cookies = {}, headers = {}, ...rest } = overrides;
  return {
    method: 'GET',
    path: '/',
    header: (name) => headers[name] ?? null,
    cookie: (name) => cookies[name],
    ...rest,
  };
}

const KEPT = {
  'cloudflare-cdn-cache-control': 'max-age=300, stale-while-revalidate=600, stale-if-error=86400',
  'cache-tag': SITE_EDGE_TAG,
};

describe('SiteEdgePolicy', () => {
  it('keeps every visitor-alike page for a Bangla reader, tagged site', () => {
    for (const path of KEPT_PATHS) expect(policy.headersFor(request({ path }))).toEqual(KEPT);
    expect(policy.headersFor(request({ cookies: { 'lytro-lang': 'bn' } }))).toEqual(KEPT);
    // An unknown cookie value reads as Bangla, as the pages read it.
    expect(policy.headersFor(request({ cookies: { 'lytro-lang': 'fr' } }))).toEqual(KEPT);
  });

  it('tells the edge never to keep an English reader’s page', () => {
    expect(policy.headersFor(request({ cookies: { 'lytro-lang': 'en' } }))).toEqual({
      'cloudflare-cdn-cache-control': 'no-store',
    });
  });

  it('leaves the contact page, past legal versions and every other path alone', () => {
    for (const path of [
      '/contact',
      '/terms/2026-11-20',
      '/privacy/2026-11-20',
      '/robots.txt',
      '/sitemap.xml',
      '/opengraph-image',
      '/nope',
      '/about/',
    ])
      expect(policy.headersFor(request({ path }))).toBeNull();
  });

  it('never keeps a form post or a HEAD', () => {
    expect(policy.headersFor(request({ method: 'POST' }))).toBeNull();
    expect(policy.headersFor(request({ method: 'POST', path: '/contact' }))).toBeNull();
    expect(policy.headersFor(request({ method: 'HEAD' }))).toBeNull();
  });

  it('keeps a page load and a crawler’s fetch, never a browser’s fetch of a page’s data', () => {
    expect(policy.headersFor(request({ headers: { 'sec-fetch-dest': 'document' } }))).toEqual(KEPT);
    // facebookexternalhit and other crawlers send no fetch metadata.
    expect(policy.headersFor(request())).toEqual(KEPT);
    // A tap on a Link: Next hides its own RSC header from middleware, the browser's fetch metadata says `empty`.
    expect(policy.headersFor(request({ headers: { 'sec-fetch-dest': 'empty' } }))).toBeNull();
    expect(policy.headersFor(request({ headers: { 'sec-fetch-dest': 'iframe' } }))).toBeNull();
  });
});
