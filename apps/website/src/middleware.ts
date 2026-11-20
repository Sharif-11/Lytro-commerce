import { NextResponse, type NextRequest } from 'next/server';
import { SiteEdgePolicy } from '@/lib/edge/site-edge';

// PHASE-9-PLAN 9.10: tells Cloudflare which pages it may keep (lib/edge/site-edge.ts, docs/DEPLOYMENT.md §9g). It
// only adds headers; it never reads the query, and no page sets a cookie. Next keeps its own RSC headers and `?_rsc=`
// from middleware, so the policy reads the browser's fetch metadata instead.

const policy = new SiteEdgePolicy();

export function middleware(request: NextRequest): NextResponse {
  const headers = policy.headersFor({
    method: request.method,
    path: request.nextUrl.pathname,
    header: (name) => request.headers.get(name),
    cookie: (name) => request.cookies.get(name)?.value,
  });
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
  return response;
}

export const config = { matcher: ['/((?!_next/|fonts/).*)'] };
