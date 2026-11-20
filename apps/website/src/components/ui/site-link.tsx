import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/**
 * Next's Link for the site's own pages, never prefetched (PHASE-9-PLAN 9.10). Next fetches a prefetch from the
 * website itself, past Cloudflare's kept copy (DEPLOYMENT §9g), so on an ad's landing page every visitor would draw the
 * pages its links point to; a tap still opens the page without a full reload. The only file that imports `next/link`
 * (test/edge-guards.test.ts).
 */
export function Link(props: Omit<ComponentProps<typeof NextLink>, 'prefetch'>) {
  return <NextLink {...props} prefetch={false} />;
}
