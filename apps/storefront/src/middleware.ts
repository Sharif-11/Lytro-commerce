import { NextResponse, type NextRequest } from 'next/server';
import { STOREFRONT_BUILD_ID } from '@/lib/app/build-id';
import { EdgeCachePolicy, type EdgeRequest } from '@/lib/edge/edge-cache';
import { EdgeRenderer } from '@/lib/edge/edge-renderer';
import { PageKeepPolicy } from '@/lib/edge/page-keep';
import { figuresLine, PageServer } from '@/lib/edge/page-server';
import { connectPageCache, RedisPageStore } from '@/lib/edge/page-store';
import { StorefrontEnvironment } from '@/lib/env';
import { STOREFRONT_PATH_HEADER, STOREFRONT_QUERY_HEADER } from '@/lib/request-path';

// Puts each request's path and query where the pages can read them (lib/request-path.ts). A page every shopper of its
// shop sees alike is drawn once more inside the storefront instead (lib/edge): kept in the storefront's Redis and
// answered from there while it is fresh (D9-33), with the edge's headers when Cloudflare may keep it too (D9-32), or the
// 503 a busy server's page needs.

const env = StorefrontEnvironment.shared();
const edgePolicy = new EdgeCachePolicy(env.platformDomain);
const keepPolicy = new PageKeepPolicy(STOREFRONT_BUILD_ID);
const renderer = new EdgeRenderer(env.selfUrl);
const pages =
  env.pageCacheRedisUrl === undefined
    ? null
    : new PageServer(new RedisPageStore(connectPageCache(env.pageCacheRedisUrl)), renderer);
const PREVIEW_PATH = '/preview';

// D9-33: how the page cache did, once a minute that it answered any page (deploy/README.md "Redis").
if (pages !== null) {
  setInterval(() => {
    const line = figuresLine(pages.takeFigures());
    if (line !== null) console.log(line);
  }, 60_000).unref();
}

export async function middleware(request: NextRequest): Promise<Response> {
  const asked: EdgeRequest = {
    method: request.method,
    host: (request.headers.get('host') ?? '').toLowerCase(),
    path: request.nextUrl.pathname,
    header: (name) => request.headers.get(name),
    cookie: (name) => request.cookies.get(name)?.value,
  };
  const edge = edgePolicy.lifetimeOf(asked);
  const keep =
    pages === null ? null : keepPolicy.keepOf({ ...asked, search: request.nextUrl.search });
  const page = { url: request.nextUrl, headers: request.headers };
  const answered =
    pages !== null && keep !== null
      ? await pages.answer(page, keep, edge)
      : edge !== null
        ? await renderer.render(page, edge)
        : null;
  if (answered !== null) return answered;

  const headers = new Headers(request.headers);
  headers.set(STOREFRONT_PATH_HEADER, request.nextUrl.pathname);
  headers.set(STOREFRONT_QUERY_HEADER, request.nextUrl.search);
  const response = NextResponse.next({ request: { headers } });
  // STOREFRONT-BUILDER-PLAN SB-12: a draft's preview is for the one who opened the link, never kept by any cache.
  if (request.nextUrl.pathname === PREVIEW_PATH) response.headers.set('cache-control', 'no-store');
  return response;
}

// D9-33: Node's runtime, for the page cache's Redis connection (Next 15.5's Node middleware).
export const config = { matcher: ['/((?!_next/|fonts/|api/).*)'], runtime: 'nodejs' };
