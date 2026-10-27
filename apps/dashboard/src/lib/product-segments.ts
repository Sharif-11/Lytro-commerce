import { StockState } from '@lytronix/validators';
import type { ProductCounts } from '@/types/catalogue';

/** TENANT-DASHBOARD-DESIGN §7.3: the Products page's segments, in the prototype's order, and Archived after them. */
export const PRODUCT_SEGMENTS = ['all', 'active', 'inactive', 'low', 'out', 'archived'] as const;
export type ProductSegment = (typeof PRODUCT_SEGMENTS)[number];

/** Each segment's chip label, in the shop dictionary. */
export const SEGMENT_LABEL: Record<ProductSegment, string> = {
  all: 'all',
  active: 'active',
  inactive: 'inactive',
  low: 'lowStock',
  out: 'outStock',
  archived: 'plArchived',
};

/**
 * PRD-12, INV-08, PRD-13: what each segment asks `GET /products` for. Low and Out are among the active products, as Home
 * counts them, so their rows and their counts agree.
 */
export function segmentQuery(segment: ProductSegment): Record<string, string> {
  switch (segment) {
    case 'active':
      return { active: 'true' };
    case 'inactive':
      return { active: 'false' };
    case 'low':
      return { active: 'true', stock: StockState.Low };
    case 'out':
      return { active: 'true', stock: StockState.Out };
    case 'archived':
      return { archived: 'true' };
    default:
      return {};
  }
}

/** A segment's count, from the counts the server gives with every page. */
export function segmentCount(segment: ProductSegment, counts: ProductCounts): number {
  switch (segment) {
    case 'active':
      return counts.active;
    case 'inactive':
      return counts.total - counts.active;
    case 'low':
      return counts.low;
    case 'out':
      return counts.out;
    case 'archived':
      return counts.archived;
    default:
      return counts.total;
  }
}
