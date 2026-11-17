import { describe, expect, it } from 'vitest';
import {
  cloudflarePricesSchema,
  DEFAULT_CLOUDFLARE_PRICES,
  storedCloudflarePricesSchema,
} from '../src/api/platform/media-costs';

// D8-60, D9-31: the price sheet the media costs estimate uses. Workers' prices went with the media Worker: a sheet
// saved before still reads, its R2 prices kept, and a new one may not name them.
describe("Cloudflare's price sheet", () => {
  const before = { ...DEFAULT_CLOUDFLARE_PRICES, r2ClassAPerMillion: 7, workersMonthly: 5 };

  it('reads a sheet saved with Workers prices, keeping its own R2 prices and dropping the rest', () => {
    const read = storedCloudflarePricesSchema.safeParse({
      ...before,
      workersIncludedMillions: 10,
      workersPerMillion: 0.3,
    });
    expect(read.success && read.data).toEqual({
      ...DEFAULT_CLOUDFLARE_PRICES,
      r2ClassAPerMillion: 7,
    });
  });

  it('saves only the R2 prices', () => {
    expect(cloudflarePricesSchema.safeParse(DEFAULT_CLOUDFLARE_PRICES).success).toBe(true);
    expect(cloudflarePricesSchema.safeParse(before).success).toBe(false);
  });
});
