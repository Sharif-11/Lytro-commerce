import { describe, expect, it } from 'vitest';
import { PRODUCT_SEGMENTS, segmentCount, segmentQuery } from '../src/lib/product-segments';

const COUNTS = { total: 6, active: 5, low: 1, out: 1, archived: 2 };

describe('the Products page’s segments (PRD-12, INV-08, PRD-13)', () => {
  it('come in the prototype’s order, Archived after them', () => {
    expect(PRODUCT_SEGMENTS).toEqual(['all', 'active', 'inactive', 'low', 'out', 'archived']);
  });

  it('ask the server for Low and Out among the active products, as Home counts them', () => {
    expect(segmentQuery('all')).toEqual({});
    expect(segmentQuery('active')).toEqual({ active: 'true' });
    expect(segmentQuery('inactive')).toEqual({ active: 'false' });
    expect(segmentQuery('low')).toEqual({ active: 'true', stock: 'low' });
    expect(segmentQuery('out')).toEqual({ active: 'true', stock: 'out' });
    expect(segmentQuery('archived')).toEqual({ archived: 'true' });
  });

  it('take each count from the server’s, Inactive being the rest of All', () => {
    expect(PRODUCT_SEGMENTS.map((segment) => segmentCount(segment, COUNTS))).toEqual([
      6, 5, 1, 1, 1, 2,
    ]);
  });
});
