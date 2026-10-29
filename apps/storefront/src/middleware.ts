import { NextResponse, type NextRequest } from 'next/server';
import { STOREFRONT_PATH_HEADER } from '@/lib/request-path';

// Puts each request's path where the not-found page can read it (lib/request-path.ts).

export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(STOREFRONT_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|fonts/|api/).*)'] };
