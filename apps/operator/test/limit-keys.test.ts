import { describe, expect, it } from 'vitest';
import { canBeUnlimited, LIMIT_KEYS, limitLabelKey } from '../src/lib/limit-keys';

describe('limit keys', () => {
  it('lists every plan limit the validator defines, retention last', () => {
    expect(LIMIT_KEYS).toContain('products');
    expect(LIMIT_KEYS).toContain('staff');
    expect(LIMIT_KEYS[LIMIT_KEYS.length - 1]).toBe('activity_retention_days');
  });

  it('allows unlimited on every cap but not on the retention period (PLN-19)', () => {
    expect(canBeUnlimited('products')).toBe(true);
    expect(canBeUnlimited('activity_retention_days')).toBe(false);
  });

  it('maps a key to its dictionary label', () => {
    expect(limitLabelKey('storage_mb')).toBe('limits.storage_mb');
  });
});
