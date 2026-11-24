import { describe, expect, it } from 'vitest';
import { apiCapInputSchema, maskedName, maskedPhone } from '../src';

// PAYG-FAIR-USE-PLAN PF-21, PFQ-6, PFQ-10: how a locked order reads, and the API cap's range.
describe('a locked order masked (PF-21, PFQ-6)', () => {
  it('shows the phone’s first and last three digits, the country code read as the local number', () => {
    expect(maskedPhone('01711234842')).toBe('017•• ••• 842');
    expect(maskedPhone('+8801711234842')).toBe('017•• ••• 842');
  });

  it('keeps only the name’s first letter', () => {
    expect(maskedName('সাদিয়া রহমান')).toBe('স•••');
    expect(maskedName('Rahim')).toBe('R•••');
    expect(maskedName(null)).toBeNull();
    expect(maskedName('  ')).toBeNull();
  });
});

describe('the API spending cap (PF-36, PFQ-10)', () => {
  it('takes ৳0 to ৳5,000, two decimals at most', () => {
    expect(apiCapInputSchema.safeParse({ cap: 0 }).success).toBe(true);
    expect(apiCapInputSchema.safeParse({ cap: 5000 }).success).toBe(true);
    expect(apiCapInputSchema.safeParse({ cap: 5000.01 }).success).toBe(false);
    expect(apiCapInputSchema.safeParse({ cap: -1 }).success).toBe(false);
  });
});
