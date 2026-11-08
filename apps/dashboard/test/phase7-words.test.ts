import { describe, expect, it } from 'vitest';
import { AddressFieldState, AddonKind, type AddressRead } from '@lytronix/validators';
import { fromEditor, partsOf, toEditor } from '../src/views/sms/sms-words';
import { filledOf } from '../src/views/orders/read-words';
import { readsOf, readsOffer, readsPercent } from '../src/views/usage/per-use';
import type { AddonOffer } from '../src/types/addons';
import type { PayPerUse, ShopUsage } from '../src/types/usage';

// Part 37's pure words (TENANT-DASHBOARD-DESIGN §7.40): an SMS template as the editor writes it, an SMS's parts, what a
// read filled, and the reads pack's share.

const NAMES: Record<string, string> = {
  order_number: 'Order number',
  amount: 'Amount',
  customer_name: "Customer's name",
  tracking_link: 'Tracking link',
};
const name = (variable: string): string => NAMES[variable] ?? variable;

describe('an SMS template in the editor (SMS-10, SMS-19)', () => {
  it('writes each variable by its name, and turns it back before saving', () => {
    const template = 'অর্ডার {order_number} পেয়েছি, মোট ৳{amount}। ধন্যবাদ!';
    const words = toEditor(template, name);
    expect(words).toBe('অর্ডার [Order number] পেয়েছি, মোট ৳[Amount]। ধন্যবাদ!');
    expect(fromEditor(words, name)).toBe(template);
  });

  it('leaves a brace it does not know as typed, for the server to refuse', () => {
    expect(toEditor('Hi {nickname}, {order_number}', name)).toBe('Hi {nickname}, [Order number]');
    expect(fromEditor('Hi [Nickname]', name)).toBe('Hi [Nickname]');
  });

  it('counts parts of 67 characters, Bangla or English alike (SMS-09)', () => {
    expect(partsOf('a'.repeat(67), 67)).toBe(1);
    expect(partsOf('a'.repeat(68), 67)).toBe(2);
    expect(partsOf('অ'.repeat(67), 67)).toBe(1);
  });
});

function read(fields: Partial<AddressRead['fields']>): AddressRead {
  const missing = AddressFieldState.Missing;
  return {
    draft: {
      customerName: null,
      phone: null,
      zillaId: null,
      locationId: null,
      deliveryAddress: null,
      notes: null,
    },
    fields: {
      customerName: missing,
      phone: missing,
      zilla: missing,
      thana: missing,
      deliveryAddress: missing,
      notes: missing,
      ...fields,
    },
    written: { phone: null, zilla: null, thana: null },
    confidence: 0,
    charged: null,
  };
}

describe('what a read filled (ORD-30, ORD-31)', () => {
  it('counts a near match, never a field not in the message', () => {
    expect(filledOf(read({}))).toBe(0);
    expect(
      filledOf(
        read({
          customerName: AddressFieldState.Found,
          phone: AddressFieldState.Found,
          zilla: AddressFieldState.Found,
          thana: AddressFieldState.Check,
          deliveryAddress: AddressFieldState.Found,
        }),
      ),
    ).toBe(5);
  });
});

const reads = (allowance: PayPerUse['allowance']): PayPerUse => ({
  key: 'address_reads',
  rate: '0.1000',
  allowance,
  outsideAllowance: { count: 0, cost: '0.00' },
});

describe('the reads pack (PLN-20)', () => {
  it('its share used, in whole percent; none without a pack', () => {
    const endsAt = '2026-11-09T18:00:00.000Z';
    expect(readsPercent(reads({ used: 180, total: 200, left: 20, endsAt }))).toBe(90);
    expect(readsPercent(reads({ used: 57, total: 200, left: 143, endsAt }))).toBe(28);
    expect(readsPercent(reads(null))).toBeNull();
  });

  it('read from Usage, and the pack for sale among the offers', () => {
    expect(readsOf(undefined)).toBeNull();
    expect(readsOf({ payPerUse: [reads(null)] } as unknown as ShopUsage)?.rate).toBe('0.1000');
    const offer = (kind: AddonKind): AddonOffer =>
      ({ addon: { id: kind, kind } }) as unknown as AddonOffer;
    expect(readsOffer([offer(AddonKind.Limit), offer(AddonKind.Allowance)])?.addon.id).toBe(
      AddonKind.Allowance,
    );
    expect(readsOffer([offer(AddonKind.Limit)])).toBeNull();
  });
});
