import { NextResponse, type NextRequest } from 'next/server';
import { STOREFRONT_PATH_HEADER, STOREFRONT_QUERY_HEADER } from '@/lib/request-path';

// Puts each request's path and query where the pages can read them (lib/request-path.ts).

export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(STOREFRONT_PATH_HEADER, request.nextUrl.pathname);
  headers.set(STOREFRONT_QUERY_HEADER, request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|fonts/|api/).*)'] };
