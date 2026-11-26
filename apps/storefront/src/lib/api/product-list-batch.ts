import { STOREFRONT_CATALOGUE_LISTS_MAX } from '@lytronix/validators';
import { productQueryString, type ProductPage, type ProductQuery } from './storefront-api';

interface Waiting {
  query: ProductQuery;
  resolve: (page: ProductPage | null) => void;
  reject: (reason: unknown) => void;
}

/**
 * Load fix 3 (the owner, 2026-11-20): the product lists one render asks for, gathered and asked for together. Every list
 * asked for before the next turn of the event loop goes in one call, so a designed home's rows, heroes and tiles are
 * one request to the server, and the lists asked for once those answer (an empty hero's newest, a tile's fallback) a
 * second. The same list is asked for once however many sections draw it. One per render: nothing is kept between
 * pages, which the server's own cache and the page cache already do.
 */
export class ProductListBatch {
  private readonly reads = new Map<string, Promise<ProductPage | null>>();
  private waiting: Waiting[] = [];

  constructor(private readonly ask: (queries: ProductQuery[]) => Promise<(ProductPage | null)[]>) {}

  /** The list, or null for a category the server no longer shows; a refusal (busy) rejects every list of its call. */
  read(query: ProductQuery): Promise<ProductPage | null> {
    const key = productQueryString(query);
    const held = this.reads.get(key);
    if (held) return held;
    const reading = new Promise<ProductPage | null>((resolve, reject) => {
      // A timer, not a microtask: a list asked for a few promise steps later in the same render still joins the call.
      if (this.waiting.length === 0) {
        setTimeout(() => {
          this.send();
        }, 0);
      }
      this.waiting.push({ query, resolve, reject });
    });
    this.reads.set(key, reading);
    return reading;
  }

  private send(): void {
    const waiting = this.waiting;
    this.waiting = [];
    // SB-32: a home with many rows and "সব প্রোডাক্ট" may ask more than one call takes; the rest go in the next calls.
    for (let at = 0; at < waiting.length; at += STOREFRONT_CATALOGUE_LISTS_MAX) {
      const batch = waiting.slice(at, at + STOREFRONT_CATALOGUE_LISTS_MAX);
      this.ask(batch.map((each) => each.query)).then(
        (pages) => {
          batch.forEach((each, index) => {
            each.resolve(pages[index] ?? null);
          });
        },
        (reason: unknown) => {
          batch.forEach((each) => {
            each.reject(reason);
          });
        },
      );
    }
  }
}
