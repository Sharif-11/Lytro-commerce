import { edgeHeaders, type EdgeLifetime } from './edge-cache';
import {
  type DrawnPage,
  isShareable,
  type EdgeRenderer,
  type ShopperPageRequest,
} from './edge-renderer';
import type { PageKeep } from './page-keep';
import type { KeptPage, PageStore } from './page-store';

/** Says where an answer came from: Redis's copy (`hit`), or drawn for this request (`miss`). Names nothing private. */
export const PAGE_CACHE_HEADER = 'x-lytro-page-cache';

/** How long a page's drawing may hold its turn, and how long another process waits for that copy before drawing. */
export interface PageServerTiming {
  turnMs: number;
  waitMs: number;
  pollMs: number;
  sleep(ms: number): Promise<void>;
}

export const REAL_PAGE_SERVER_TIMING: PageServerTiming = {
  turnMs: 15_000,
  waitMs: 2_000,
  pollMs: 100,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

// A page tagged with more products than this isn't kept: its check would read too many tags' times on every visit.
const MOST_TAGS = 500;
// Headers of the drawn page that say something about its one answer, not the page.
const UNKEPT_HEADERS = new Set(['date', PAGE_CACHE_HEADER]);

/** How many pages a process answered: from a copy, not from one, and while Redis didn't answer. */
export interface PageCacheFigures {
  hits: number;
  misses: number;
  unavailable: number;
}

/** The log line a process writes each minute it answered any page, so the copy's worth is measured (SCL-13). */
export function figuresLine(figures: PageCacheFigures): string | null {
  const pages = figures.hits + figures.misses + figures.unavailable;
  if (pages === 0) return null;
  const share = Math.round((figures.hits * 100) / pages);
  return (
    `page cache: ${String(pages)} pages, ${String(share)}% from the copy, ` +
    `${String(figures.misses)} drawn, ${String(figures.unavailable)} without Redis`
  );
}

/** One drawing's result, which every request for the page in this process waiting on it shares. */
type Drawing =
  | { kind: 'kept'; page: KeptPage; now: number }
  | { kind: 'drawn'; page: DrawnPage }
  | { kind: 'failed' };

/**
 * D9-33: answers a page every shopper of its shop sees alike from the storefront's Redis, drawing it at most once while
 * it is fresh: once in this process however many ask together, and once across processes (the others wait a moment
 * for that copy). A copy handed to Cloudflare's edge carries only what is left of its time, so a page is never older
 * than its lifetime at either. Null when the page is to be rendered as usual (Redis didn't answer and the edge won't
 * keep it, or the storefront couldn't be asked).
 */
export class PageServer {
  private readonly drawings = new Map<string, Promise<Drawing>>();
  private counted: PageCacheFigures = { hits: 0, misses: 0, unavailable: 0 };

  constructor(
    private readonly store: PageStore,
    private readonly renderer: Pick<EdgeRenderer, 'draw' | 'answer' | 'render'>,
    private readonly timing: PageServerTiming = REAL_PAGE_SERVER_TIMING,
  ) {}

  /** `edge` is the edge's lifetime when Cloudflare may keep the page too, else null. */
  async answer(
    request: ShopperPageRequest,
    keep: PageKeep,
    edge: EdgeLifetime | null,
  ): Promise<Response | null> {
    const found = await this.store.find(keep.key);
    if (found.kind === 'unavailable') {
      this.counted.unavailable += 1;
      // As before the page cache: the edge's own render, or the usual one.
      return edge === null ? null : this.renderer.render(request, edge);
    }
    if (found.kind === 'kept') {
      this.counted.hits += 1;
      return PageServer.fromKept(found.page, found.now, edge);
    }
    this.counted.misses += 1;

    let drawing = this.drawings.get(keep.key);
    if (drawing === undefined) {
      drawing = this.draw(request, keep, found.now).finally(() => {
        this.drawings.delete(keep.key);
      });
      this.drawings.set(keep.key, drawing);
    }
    const drawn = await drawing;
    switch (drawn.kind) {
      case 'kept':
        return PageServer.fromKept(drawn.page, drawn.now, edge);
      case 'drawn': {
        const answer = this.renderer.answer(drawn.page, edge);
        answer.headers.set(PAGE_CACHE_HEADER, 'miss');
        return answer;
      }
      case 'failed':
        return null;
    }
  }

  /** Draws the page and keeps it, unless another process is drawing it already and its copy comes soon. */
  private async draw(request: ShopperPageRequest, keep: PageKeep, now: number): Promise<Drawing> {
    const turn = await this.store.takeTurn(keep.key, this.timing.turnMs);
    if (turn === 'held') {
      const theirs = await this.waitFor(keep.key);
      if (theirs !== null) return theirs;
    }
    try {
      const page = await this.renderer.draw(request);
      if (page === null) return { kind: 'failed' };
      const tags = page.marks.tags ?? [];
      if (isShareable(page) && tags.length <= MOST_TAGS) {
        // Its drawing started no later than `now` (Redis's clock, read before it): a purge after that clears it.
        await this.store.keep(keep.key, {
          status: page.status,
          headers: [...page.headers].filter(([name]) => !UNKEPT_HEADERS.has(name)),
          html: page.html,
          tags,
          drawnAt: now,
          freshUntil: now + keep.lifetime.maxAge * 1000,
        });
      }
      return { kind: 'drawn', page };
    } finally {
      if (turn === 'taken') await this.store.endTurn(keep.key);
    }
  }

  /** The pages answered since the last call: from a copy, drawn (a copy waited for counts as drawn), without Redis. */
  takeFigures(): PageCacheFigures {
    const figures = this.counted;
    this.counted = { hits: 0, misses: 0, unavailable: 0 };
    return figures;
  }

  private async waitFor(key: string): Promise<Drawing | null> {
    for (let waited = 0; waited < this.timing.waitMs; waited += this.timing.pollMs) {
      await this.timing.sleep(this.timing.pollMs);
      const found = await this.store.find(key);
      if (found.kind === 'kept') return { kind: 'kept', page: found.page, now: found.now };
      if (found.kind === 'unavailable') return null;
    }
    return null;
  }

  private static fromKept(page: KeptPage, now: number, edge: EdgeLifetime | null): Response {
    const headers = new Headers(page.headers);
    const left = Math.floor((page.freshUntil - now) / 1000);
    if (edge !== null && left > 0) {
      const lifetime = { maxAge: left, staleWhileRevalidate: edge.staleWhileRevalidate };
      for (const [name, value] of Object.entries(edgeHeaders(lifetime, page.tags))) {
        headers.set(name, value);
      }
    }
    headers.set(PAGE_CACHE_HEADER, 'hit');
    return new Response(page.html, { status: page.status, headers });
  }
}
