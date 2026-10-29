import { serviceWorkerSource } from '@/lib/app/service-worker';

// CCH-10 (Slice 12c): the storefront's service worker, at the site's root so it may look after every page. Never kept
// by the browser's own cache: a new build's worker is seen on the next visit.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(serviceWorkerSource(process.env['STOREFRONT_BUILD_ID'] ?? 'dev'), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    },
  });
}
