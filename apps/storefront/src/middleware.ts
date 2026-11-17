import { NextResponse, type NextRequest } from 'next/server';
import { EdgeCachePolicy } from '@/lib/edge/edge-cache';
import { EdgeRenderer } from '@/lib/edge/edge-renderer';
import { StorefrontEnvironment } from '@/lib/env';
import { STOREFRONT_PATH_HEADER, STOREFRONT_QUERY_HEADER } from '@/lib/request-path';

// Puts each request's path and query where the pages can read them (lib/request-path.ts). A page Cloudflare's edge may
// keep (Slice 9.10, D9-32) is rendered through the EdgeRenderer instead, which gives it the edge's headers, or the 503 a
// busy server's page needs.

const env = StorefrontEnvironment.shared();
const policy = new EdgeCachePolicy(env.platformDomain);
const renderer = new EdgeRenderer(env.selfUrl);

export async function middleware(request: NextRequest): Promise<Response> {
  const lifetime = policy.lifetimeOf({
    method: request.method,
    host: (request.headers.get('host') ?? '').toLowerCase(),
    path: request.nextUrl.pathname,
    header: (name) => request.headers.get(name),
    cookie: (name) => request.cookies.get(name)?.value,
  });
  if (lifetime !== null) {
    const rendered = await renderer.render(
      { url: request.nextUrl, headers: request.headers },
      lifetime,
    );
    if (rendered !== null) return rendered;
  }
  const headers = new Headers(request.headers);
  headers.set(STOREFRONT_PATH_HEADER, request.nextUrl.pathname);
  headers.set(STOREFRONT_QUERY_HEADER, request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|fonts/|api/).*)'] };
