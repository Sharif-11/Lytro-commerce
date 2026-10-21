import { MEDIA_QUOTA_HEADER } from '@lytronix/shared-types';
import type { EdgeState } from './edge-state';
import { readMediaPath, type MediaTarget } from './media-path';
import { StoreUnavailable, type MediaOrigin } from './origin';
import type { LinkVerifier } from './signed-link';
import { counted, type UsageRecorder } from './usage';

// MED-08: a public file's name changes whenever its content does, so a browser and this cache keep it for a year.
const PUBLIC_CACHE = 'public, max-age=31536000, immutable';
// BND-07: a private file is never kept anywhere.
const PRIVATE_CACHE = 'private, no-store';
// MED-11: when to try again while the store is away.
const RETRY_AFTER_SECONDS = '60';
// MED-13: what a script on a registered site may read of a response.
const EXPOSED_HEADERS = 'Content-Length, Content-Range, Accept-Ranges, ETag';
const PREFLIGHT_MAX_AGE = '86400';

/** What the handler is made of: where files come from, the shared store, the link check, usage, and the cache. */
export interface MediaHandlerParts {
  origin: MediaOrigin;
  state: EdgeState;
  links: LinkVerifier;
  usage: UsageRecorder;
  cache: Cache;
  /** The dashboard's and the operator console's addresses: they still see an offline shop's media. */
  dashboardOrigins: readonly string[];
}

/** A response with no body, as a HEAD request gets; the body it had is let go. */
function withoutBody(response: Response): Response {
  void response.body?.cancel();
  return new Response(null, response);
}

/**
 * MED-02, MED-10, MED-13, BND-01, BND-03, BND-07: serves the media address. A path names one shop's object (MED-01).
 * In order: a script on a site the shop has not registered is refused; a shop over its bandwidth (429 with
 * `X-Quota: bandwidth`) or offline (403, except to the dashboard) is refused before the cache or the store are read; a
 * private file needs a valid signed link; then the cache, and the store only on a miss. Every response for a shop is
 * counted, with the bytes its body actually sent.
 */
export class MediaHandler {
  constructor(private readonly parts: MediaHandlerParts) {}

  async handle(request: Request, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const target = readMediaPath(url.pathname);
    if (!target) return new Response(null, { status: 404 });
    const answer = await this.answer(request, url, target, ctx);
    const sent = request.method === 'HEAD' ? withoutBody(answer) : answer;
    return counted(sent, ctx, (bytes) => {
      this.parts.usage.record(
        target.tenantId,
        target.private ? 'private' : 'public',
        answer.status,
        bytes,
      );
    });
  }

  private async answer(
    request: Request,
    url: URL,
    target: MediaTarget,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    }
    // MED-13: a script on another site may read a shop's media only from the shop's registered addresses.
    const origin = request.headers.get('origin');
    const cors = origin === null ? null : await this.allowedOrigin(target.tenantId, origin);
    if (origin !== null && cors === null) return this.refused(403, {}, null);
    if (method === 'OPTIONS') return this.preflight(cors);

    // MED-02, MED-10, BND-03: a blocked shop is refused before the cache or the store are read.
    const block = await this.parts.state.blockReason(target.tenantId);
    if (block === 'bandwidth')
      return this.refused(429, { [MEDIA_QUOTA_HEADER]: 'bandwidth' }, cors);
    if (block === 'offline' && !this.fromDashboard(request)) return this.refused(403, {}, cors);

    // BND-07: a private file only through a signed link that has not expired.
    if (target.private && !(await this.parts.links.verify(url))) {
      return this.refused(403, {}, cors);
    }

    const range = request.headers.get('range');
    let file: Response | null;
    try {
      file = target.private
        ? await this.parts.origin.get(target.key, range)
        : await this.publicFile(url, target.key, range, ctx);
    } catch (error) {
      if (!(error instanceof StoreUnavailable)) throw error;
      // MED-11: operator alert, as a log line until alerting exists (OD-43): the media store cannot be reached.
      console.error(`media worker: ${error.message}`);
      return this.refused(503, { 'retry-after': RETRY_AFTER_SECONDS }, cors);
    }
    if (file === null) return this.refused(404, {}, cors);
    return this.decorated(file, target.private, cors);
  }

  /**
   * MED-02, MED-08: a public file from the cache, else from the store. A whole file read from the store is kept in
   * the cache; a range that missed is read alone and not kept.
   */
  private async publicFile(
    url: URL,
    key: string,
    range: string | null,
    ctx: ExecutionContext,
  ): Promise<Response | null> {
    const cacheKey = `${url.origin}${url.pathname}`;
    const hit = await this.parts.cache.match(
      new Request(cacheKey, range === null ? {} : { headers: { range } }),
    );
    if (hit) return hit;
    const file = await this.parts.origin.get(key, range);
    if (file === null || range !== null || file.status !== 200) return file;
    const kept = new Response(file.body, file);
    kept.headers.set('cache-control', PUBLIC_CACHE);
    ctx.waitUntil(this.parts.cache.put(cacheKey, kept.clone()));
    return kept;
  }

  private decorated(file: Response, isPrivate: boolean, cors: string | null): Response {
    const response = new Response(file.body, file);
    response.headers.set('cache-control', isPrivate ? PRIVATE_CACHE : PUBLIC_CACHE);
    response.headers.set('x-content-type-options', 'nosniff');
    this.allow(response.headers, cors);
    return response;
  }

  private refused(status: number, extra: Record<string, string>, cors: string | null): Response {
    const headers = new Headers({ ...extra, 'cache-control': 'no-store' });
    this.allow(headers, cors);
    return new Response(null, { status, headers });
  }

  private preflight(cors: string | null): Response {
    const headers = new Headers({ allow: 'GET, HEAD, OPTIONS' });
    if (cors !== null) {
      this.allow(headers, cors);
      headers.set('access-control-allow-methods', 'GET, HEAD');
      headers.set('access-control-allow-headers', 'Range');
      headers.set('access-control-max-age', PREFLIGHT_MAX_AGE);
    }
    return new Response(null, { status: 204, headers });
  }

  private allow(headers: Headers, cors: string | null): void {
    if (cors === null) return;
    headers.set('access-control-allow-origin', cors);
    headers.set('access-control-expose-headers', EXPOSED_HEADERS);
    headers.append('vary', 'Origin');
  }

  /** MED-13: the origin, when it is the dashboard or one of the shop's registered website addresses; else null. */
  private async allowedOrigin(tenantId: string, origin: string): Promise<string | null> {
    if (this.parts.dashboardOrigins.includes(origin)) return origin;
    return (await this.parts.state.originsOf(tenantId)).includes(origin) ? origin : null;
  }

  /** Slice 7 point 4: a request from the dashboard or the operator console, by its origin or the page it came from. */
  private fromDashboard(request: Request): boolean {
    const referer = request.headers.get('referer');
    let refererOrigin: string | null = null;
    if (referer !== null && URL.canParse(referer)) refererOrigin = new URL(referer).origin;
    return [request.headers.get('origin'), refererOrigin].some(
      (origin) => origin !== null && this.parts.dashboardOrigins.includes(origin),
    );
  }
}
