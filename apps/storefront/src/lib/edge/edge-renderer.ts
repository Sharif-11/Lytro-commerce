import {
  EDGE_HOST_HEADER,
  EDGE_RENDER_HEADER,
  type EdgeLifetime,
  type EdgeMarks,
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

/** A page as the storefront drew it for every shopper alike: its status, its own headers, its HTML and its marks. */
export interface DrawnPage {
  status: number;
  /** The page's own headers, the hop-by-hop ones and those a re-read body no longer matches left out. */
  headers: Headers;
  html: string;
  marks: EdgeMarks;
}

/** Whether any shopper may be handed this page as it is: whole, tagged, no one's own, and setting nothing. */
export function isShareable(page: DrawnPage): boolean {
  return (
    page.status === 200 &&
    page.marks.tags !== null &&
    page.marks.busySeconds === null &&
    !page.marks.private &&
    !page.headers.has('set-cookie')
  );
}

/**
 * Slice 9.10, D9-32: renders a page every shopper sees alike by asking the storefront for it once more (its own address,
 * with EDGE_RENDER_HEADER), then answers with what the page's marks say: the edge's lifetime and the page's tags for a
 * page the edge may keep; a 503 with the server's wait, which nothing keeps, when the server was too busy (a page can't
 * set its own status); otherwise the page as it came, kept nowhere. The storefront's Redis keeps what it draws (D9-33,
 * PageServer).
 */
export class EdgeRenderer {
  constructor(
    private readonly selfUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Draws the page and answers it; null when the storefront couldn't be asked, so it is rendered as usual. */
  async render(
    request: ShopperPageRequest,
    lifetime: EdgeLifetime | null,
  ): Promise<Response | null> {
    const page = await this.draw(request);
    return page === null ? null : this.answer(page, lifetime);
  }

  /** The page as every shopper of its shop sees it; null when the storefront couldn't be asked. */
  async draw(request: ShopperPageRequest): Promise<DrawnPage | null> {
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
    const own = new Headers(inner.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) own.delete(name);
    return { status: inner.status, headers: own, html, marks: readEdgeMarks(html) };
  }

  /** The answer for a drawn page: with the edge's lifetime when the edge may keep it (`lifetime` not null). */
  answer(page: DrawnPage, lifetime: EdgeLifetime | null): Response {
    const answer = new Headers(page.headers);
    if (page.marks.busySeconds !== null) {
      answer.set('retry-after', String(page.marks.busySeconds));
      answer.set('cache-control', 'no-store');
      return new Response(page.html, { status: 503, headers: answer });
    }
    if (lifetime !== null && isShareable(page)) {
      for (const [name, value] of Object.entries(edgeHeaders(lifetime, page.marks.tags ?? []))) {
        answer.set(name, value);
      }
    }
    return new Response(page.html, { status: page.status, headers: answer });
  }
}
