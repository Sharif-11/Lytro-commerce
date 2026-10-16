// Same reasoning as admin-url.ts: in production, /api/* is reverse-proxied to apps/server on this same
// host (docs/DEPLOYMENT.md §5), so a plain relative path reaches it with no cross-origin request. Locally
// there's no Caddy in front of these dev servers, so API_URL overrides the base to reach the server's own
// dev port directly; production never sets it.
const API_BASE_URL = process.env.API_URL ?? '';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** D2-12: server-rendered, not client-fetched — the pricing section is a plain Server Component, so this
    runs at request/build time, never shipping fetch logic to the browser bundle. Returns null on any
    failure (network error, non-2xx) rather than throwing, since a landing page should degrade to its old
    static copy, not 500, if the API happens to be down when a crawler or visitor hits it. */
export async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      // The plan/term/price catalogue changes rarely and only via an operator action -- a short cache
      // keeps a traffic spike from hammering the API, without serving stale prices for long.
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ApiEnvelope<T>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}
