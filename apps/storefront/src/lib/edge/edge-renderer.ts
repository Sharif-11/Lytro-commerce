import {
  EDGE_HOST_HEADER,
  EDGE_RENDER_HEADER,
  type EdgeLifetime,
  edgeHeaders,
  readEdgeMarks,
} from './edge-cache';

// Hop-by-hop headers, and the ones a re-read body no longer matches.
const DROPPED_REQUEST_HEADERS = [
  'connection',
  'keep-alive',
  'content-length',
  'transfer-encoding',
  'upgrade',
];
const DROPPED_RESPONSE_HEADERS = [
  'connection',
  'keep-alive',
  'content-length',
  'content-encoding',
  'transfer-encoding',
];
// Long enough for any page the server can give; a page slower than this is rendered for its shopper as usual.
const RENDER_TIMEOUT_MS = 30_000;

/** The request as the middleware holds it, so the renderer is tested without Next. */
export interface ShopperPageRequest {
  url: URL;
  headers: Headers;
}

/**
 * Slice 9.10, D9-32: renders a page the edge may keep by asking the storefront for it once more (its own address, with
 * EDGE_RENDER_HEADER), then answers with what the page's marks say: the edge's lifetime and the page's tags for a page
 * every shopper sees alike; a 503 with the server's wait, which the edge never keeps, when the server was too busy (a
 * page can't set its own status); otherwise the page as it came, kept nowhere. Null when the storefront couldn't be
 * asked, so the middleware renders the page as usual.
 */
export class EdgeRenderer {
  constructor(
    private readonly selfUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async render(request: ShopperPageRequest, lifetime: EdgeLifetime): Promise<Response | null> {
    const headers = new Headers(request.headers);
    for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
    headers.set('accept-encoding', 'identity');
    headers.set(EDGE_RENDER_HEADER, '1');
    headers.set(EDGE_HOST_HEADER, request.headers.get('host') ?? request.url.host);

    let inner: Response;
    let html: string;
    try {
      inner = await this.fetcher(`${this.selfUrl}${request.url.pathname}${request.url.search}`, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      });
      html = await inner.text();
    } catch {
      return null;
    }

    // The marks stay in the page: its React data carries them too, and they name nothing a shopper can't see.
    const marks = readEdgeMarks(html);
    const answer = new Headers(inner.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) answer.delete(name);

    if (marks.busySeconds !== null) {
      answer.set('retry-after', String(marks.busySeconds));
      answer.set('cache-control', 'no-store');
      return new Response(html, { status: 503, headers: answer });
    }
    const kept =
      inner.status === 200 && marks.tags !== null && !marks.private && !answer.has('set-cookie');
    if (kept) {
      for (const [name, value] of Object.entries(edgeHeaders(lifetime, marks.tags ?? []))) {
        answer.set(name, value);
      }
    }
    return new Response(html, { status: inner.status, headers: answer });
  }
}
