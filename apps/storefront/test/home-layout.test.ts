import {
  ProductRowLayout,
  ProductRowSource,
  PUBLIC_PAGE_SIZE_MAX,
  STOREFRONT_ALL_PRODUCTS_PAGE,
  StorefrontSectionKind,
  StorefrontThemeKey,
  storefrontRowFill,
  type StorefrontSection,
} from '@lytronix/validators';
import { describe, expect, it } from 'vitest';

import type { ProductCard, PublicStorefrontDesign } from '../src/lib/api/storefront-api';
import { allProductsAt, homeLayout, homeReadPlan } from '../src/lib/design/home-reads';
import { nextStop, overflows } from '../src/lib/design/rotation';

// STOREFRONT-BUILDER-PLAN SB-32 (the owner, 2026-11-26): every product on the home -- no card twice, no automatic row
// short of its fill, everything else in "সব প্রোডাক্ট" -- and the category strip that moves only when it overflows.

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function row(
  at: number,
  source: ProductRowSource,
  extra: Partial<ProductsSection> = {},
): ProductsSection {
  return {
    id: id(at),
    visible: true,
    kind: StorefrontSectionKind.Products,
    source,
    categoryId: null,
    productIds: [],
    title: null,
    layout: ProductRowLayout.Grid,
    count: 4,
    ...extra,
  };
}

function design(sections: StorefrontSection[]): PublicStorefrontDesign {
  return {
    theme: StorefrontThemeKey.Studio,
    palette: 0,
    sections,
    images: {},
    categories: [
      { id: 'pan', slug: 'panjabi', name: 'Panjabi' },
      { id: 'kur', slug: 'kurti', name: 'Kurti' },
    ],
    products: [],
    preview: false,
  };
}

const card = (name: string, designId: string | null = null): ProductCard =>
  ({ id: `id-${name}`, slug: name, name, designId }) as unknown as ProductCard;
const cards = (...names: string[]) => names.map((name) => card(name));
const names = (list: readonly ProductCard[] | undefined) => (list ?? []).map((each) => each.name);

const NEWEST = row(1, ProductRowSource.Newest);
const SALE = row(2, ProductRowSource.OnSale, { layout: ProductRowLayout.Carousel, count: 6 });
const PANJABI = row(3, ProductRowSource.Category, { categoryId: 'pan' });
const KURTI = row(4, ProductRowSource.Category, { categoryId: 'kur' });
const TRUST: StorefrontSection = { id: id(9), visible: true, kind: StorefrontSectionKind.Trust };

describe('what the home reads for its rows and "সব প্রোডাক্ট" (SB-32)', () => {
  it('asks each automatic row for its count and as many again as the rows above may show', () => {
    const plan = homeReadPlan(design([NEWEST, SALE, PANJABI, KURTI, TRUST]));
    expect(plan.rows.map((each) => each.query.limit)).toEqual([4, 6 + 4, 4 + 10, 4 + 14]);
    expect(plan.all).toEqual({ sort: 'featured', limit: STOREFRONT_ALL_PRODUCTS_PAGE + 18 });
  });

  it('asks a picked row only for its products, and never more than a page holds', () => {
    const picked = row(5, ProductRowSource.Picked, { productIds: [] });
    const many = Array.from({ length: 12 }, (_, at) =>
      row(10 + at, ProductRowSource.Newest, { count: 12 }),
    );
    const plan = homeReadPlan(design(many));
    expect(Math.max(...plan.rows.map((each) => each.query.limit ?? 0))).toBe(PUBLIC_PAGE_SIZE_MAX);
    expect(plan.all.limit).toBe(PUBLIC_PAGE_SIZE_MAX);
    // A picked row naming nothing shoppers can reach reads nothing.
    expect(homeReadPlan(design([picked])).rows).toEqual([]);
  });

  it("needs 4 for a grid and 5 for a carousel, or the row's own count when fewer", () => {
    expect(storefrontRowFill({ layout: ProductRowLayout.Grid, count: 8 })).toBe(4);
    expect(storefrontRowFill({ layout: ProductRowLayout.Carousel, count: 6 })).toBe(5);
    expect(storefrontRowFill({ layout: ProductRowLayout.Carousel, count: 4 })).toBe(4);
  });
});

describe('what the home shows (SB-32)', () => {
  it('shows nothing twice, drops a row left short, and puts the rest in "সব প্রোডাক্ট" (ha-mixed)', () => {
    const laid = homeLayout(
      design([NEWEST, SALE, PANJABI, KURTI]),
      new Map([
        [NEWEST.id, cards('k1', 'u1', 'u2', 'u3', 'u4', 'k2')],
        [SALE.id, cards('p1', 'u2', 's1', 'k4', 'u9', 'u14', 'k2')],
        // Four panjabis, one already on sale: three left, short of a grid.
        [PANJABI.id, cards('p1', 'p2', 'p3', 'p4')],
        [KURTI.id, cards('k1', 'k2', 'k3', 'k4', 'k5', 'k6')],
      ]),
      { products: cards('k1', 'u1', 'p2', 'p3', 'p4', 'u5', 'k3', 's2'), nextCursor: 'next' },
    );
    expect(names(laid.rows.get(NEWEST.id))).toEqual(['k1', 'u1', 'u2', 'u3']);
    expect(names(laid.rows.get(SALE.id))).toEqual(['p1', 's1', 'k4', 'u9', 'u14', 'k2']);
    expect(laid.rows.has(PANJABI.id)).toBe(false);
    expect(laid.rows.has(KURTI.id)).toBe(false);
    expect(names(laid.all.shown)).toEqual(['p2', 'p3', 'p4', 'u5', 'k3', 's2']);
    expect(laid.all.queued).toEqual([]);
    expect(laid.all.cursor).toBe('next');
    expect(laid.all.above).toHaveLength(10);
    // Every card on the page, so the next page skips them.
    expect(new Set(laid.all.seen).size).toBe(16);
  });

  it('shows a picked row as chosen, and skips its cards in the rows below', () => {
    const picked = row(5, ProductRowSource.Picked, { productIds: ['x'] });
    const laid = homeLayout(
      design([picked, NEWEST]),
      new Map([
        [picked.id, cards('a', 'b')],
        [NEWEST.id, cards('a', 'b', 'c', 'd', 'e', 'f')],
      ]),
      { products: [], nextCursor: null },
    );
    expect(names(laid.rows.get(picked.id))).toEqual(['a', 'b']);
    expect(names(laid.rows.get(NEWEST.id))).toEqual(['c', 'd', 'e', 'f']);
  });

  // The owner, 2026-11-26: a running offer's row always shows, however few are left; it still skips what showed above.
  it("shows an offer's row short of its grid, skipping what a row above showed", () => {
    const offer = row(6, ProductRowSource.Offer, { offerId: 'eid' });
    const laid = homeLayout(
      design([NEWEST, offer]),
      new Map([
        [NEWEST.id, cards('a', 'b', 'c', 'd')],
        [offer.id, cards('a', 'x', 'y')],
      ]),
      { products: cards('a', 'b', 'c', 'd', 'x', 'y', 'z'), nextCursor: null },
    );
    expect(names(laid.rows.get(offer.id))).toEqual(['x', 'y']);
    expect(names(laid.all.shown)).toEqual(['z']);
  });

  it('a small shop shows each product once, the newest four then the rest (ha-small)', () => {
    const seven = cards('a', 'b', 'c', 'd', 'e', 'f', 'g');
    const laid = homeLayout(
      design([NEWEST, SALE]),
      new Map([
        [NEWEST.id, seven],
        [SALE.id, cards('b', 'e')],
      ]),
      { products: seven, nextCursor: null },
    );
    expect(names(laid.rows.get(NEWEST.id))).toEqual(['a', 'b', 'c', 'd']);
    expect(laid.rows.has(SALE.id)).toBe(false);
    expect(names(laid.all.shown)).toEqual(['e', 'f', 'g']);
  });

  it('keeps twelve at a time, holding the rest of the read for the next', () => {
    const many = Array.from({ length: 20 }, (_, at) => card(`n${String(at)}`));
    const laid = homeLayout(design([]), new Map(), { products: many, nextCursor: null });
    expect(laid.all.shown).toHaveLength(STOREFRONT_ALL_PRODUCTS_PAGE);
    expect(laid.all.queued).toHaveLength(20 - STOREFRONT_ALL_PRODUCTS_PAGE);
  });

  it("counts a design's card as its own card (DC-1)", () => {
    const laid = homeLayout(
      design([NEWEST]),
      new Map([[NEWEST.id, [card('a', 'd1'), card('b'), card('c'), card('d')]]]),
      { products: [card('a', 'd1'), card('a', 'd2')], nextCursor: null },
    );
    expect(laid.all.shown.map((each) => each.designId)).toEqual(['d2']);
  });

  it('goes after the last row of products; with none, before the trust strip, else at the end (Q1)', () => {
    expect(allProductsAt([NEWEST, TRUST, SALE, TRUST])).toBe(3);
    expect(allProductsAt([TRUST])).toBe(0);
    expect(allProductsAt([])).toBe(0);
  });
});

describe('the category strip moves only when its tiles overflow (SB-32)', () => {
  const tiles = (count: number, width = 128, gap = 12) =>
    Array.from({ length: count }, (_, at) => ({ left: 16 + at * (width + gap), width }));

  it('overflows when the tiles run past the strip, not when they fit', () => {
    expect(overflows(tiles(6), 358)).toBe(true);
    expect(overflows(tiles(2), 358)).toBe(false);
    expect(overflows(tiles(0), 358)).toBe(false);
    // A computer wraps its tiles: the last one's right edge is within the strip.
    expect(
      overflows(
        [
          { left: 0, width: 180 },
          { left: 0, width: 180 },
        ],
        1200,
      ),
    ).toBe(false);
  });

  it('steps to the next tile, and has none at the end', () => {
    expect(nextStop(tiles(6), 0)).toBe(140);
    expect(nextStop(tiles(6), 140)).toBe(280);
    expect(nextStop(tiles(3), 280)).toBeNull();
  });
});
