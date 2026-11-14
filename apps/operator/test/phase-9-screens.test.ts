import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  PlatformSettingKey,
  ReconciliationDifferenceKind,
  ReconciliationDifferenceState,
} from '@lytronix/validators';
import { navGroups } from '../src/components/layout/nav-items';
import bn from '../src/i18n/locales/bn.json';
import en from '../src/i18n/locales/en.json';
import { SETTING_GROUPS, SETTING_SHAPES, VAT_GROUP, VAT_KEYS } from '../src/lib/setting-shapes';
import { COUNTED, settingWords } from '../src/lib/setting-words';
import type { ReconciliationDifference } from '../src/types/operator';
import {
  differenceFigures,
  differenceLinks,
  exactTaka,
} from '../src/views/money-check/difference-words';
import { daysInOrder, lastThirtyDays } from '../src/lib/credential-days';
import { includedVat } from '../src/lib/vat-words';

// Slice 9.9: the console's limited mode, money check, VAT settings and the credential-use export -- what they work out.

const FACTOR: string = PlatformSettingKey.DegradedFactor;

/** Reads the English words, with {{name}} filled, as the console's i18next does. */
const t = ((key: string, values: Record<string, unknown> = {}) => {
  const path = key.split('.');
  const count = values['count'];
  let node: unknown = en;
  for (const [index, part] of path.entries()) {
    const branch = node as Record<string, unknown>;
    const last = index === path.length - 1;
    node =
      last && typeof count === 'number'
        ? (branch[`${part}_${count === 1 ? 'one' : 'other'}`] ?? branch[part])
        : branch[part];
  }
  return String(node).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name]));
}) as unknown as TFunction;

function difference(overrides: Partial<ReconciliationDifference>): ReconciliationDifference {
  return {
    id: 'd1',
    day: '2026-10-20',
    kind: ReconciliationDifferenceKind.TopUpCreditMismatch,
    subject: 'p1',
    tenantId: 't1',
    shopName: 'Arif Electronics',
    shopSlug: 'arif-electronics',
    expected: '500',
    found: '0',
    details: {},
    state: ReconciliationDifferenceState.Open,
    note: null,
    resolvedBy: null,
    resolvedByEmail: null,
    resolvedAt: null,
    createdAt: '2026-10-21T00:00:05.000Z',
    ...overrides,
  };
}

describe('the money check (DAT-52)', () => {
  it('writes money to the paisa', () => {
    expect(exactTaka('500')).toBe('৳500.00');
    expect(exactTaka('1280.5')).toBe('৳1,280.50');
  });

  it('says what should be and what was found, an invoice count in words', () => {
    expect(differenceFigures(difference({}), t)).toEqual({ expected: '৳500.00', found: '৳0.00' });
    expect(differenceFigures(difference({ expected: null, found: '1280' }), t)).toEqual({
      expected: '—',
      found: '৳1,280.00',
    });
    const invoices = (count: number) =>
      differenceFigures(
        difference({
          kind: ReconciliationDifferenceKind.InvoiceMismatch,
          expected: null,
          found: null,
          details: { invoices: count },
        }),
        t,
      );
    expect(invoices(0)).toEqual({ expected: '1 invoice', found: 'No invoice' });
    expect(invoices(2)).toEqual({ expected: '1 invoice', found: '2 invoices' });
  });

  it("links to the shop, the payment only while it's in the queue, and Lytro's receipts", () => {
    expect(differenceLinks(difference({}))).toEqual([{ kind: 'shop', shopId: 't1' }]);
    expect(
      differenceLinks(
        difference({ kind: ReconciliationDifferenceKind.ProofWithoutPayment, subject: 'p9' }),
      ),
    ).toEqual([
      { kind: 'shop', shopId: 't1' },
      { kind: 'payment', paymentId: 'p9' },
    ]);
    expect(
      differenceLinks(
        difference({
          kind: ReconciliationDifferenceKind.WalletMoneyUnclaimed,
          tenantId: null,
          shopName: null,
          shopSlug: null,
        }),
      ),
    ).toEqual([{ kind: 'receipt' }]);
  });

  it('has a name and a line for every kind, in both languages', () => {
    for (const kind of Object.values(ReconciliationDifferenceKind)) {
      for (const words of [en, bn]) {
        expect(words.moneyCheck.kinds[kind], kind).toEqual(expect.any(String));
        expect(words.moneyCheck.kindHints[kind], kind).toEqual(expect.any(String));
      }
    }
  });

  it('is in the menu, first of the records, with its count', () => {
    const records = navGroups.find((group) => group.labelKey === 'nav.records');
    expect(records?.items[0]).toMatchObject({ to: '/money-check', count: 'moneyCheck' });
  });
});

describe('limited mode and VAT in Settings (D9-14, D9-7)', () => {
  it('adds the divider as group 16 and the four VAT settings as group 17', () => {
    expect(SETTING_GROUPS).toHaveLength(17);
    expect(SETTING_SHAPES.find((shape) => shape.key === FACTOR)).toEqual({
      key: PlatformSettingKey.DegradedFactor,
      group: 16,
      unit: 'divisor',
    });
    expect(VAT_GROUP).toBe(17);
    expect(VAT_KEYS).toEqual([
      PlatformSettingKey.VatBin,
      PlatformSettingKey.VatRate,
      PlatformSettingKey.VatSellerName,
      PlatformSettingKey.VatSellerAddress,
    ]);
    expect(COUNTED).toContain('divisor');
  });

  it('says the divider and the VAT settings in words, and "Not set" for one never given', () => {
    expect(settingWords(PlatformSettingKey.DegradedFactor, 2, t)).toBe('÷2 while on');
    expect(settingWords(PlatformSettingKey.VatRate, '15', t)).toBe('15%');
    // The settings store reads text such as "15" back as a number; it still says 15%.
    expect(settingWords(PlatformSettingKey.VatRate, 15, t)).toBe('15%');
    expect(settingWords(PlatformSettingKey.VatBin, '', t)).toBe('Not set');
    expect(settingWords(PlatformSettingKey.VatBin, '123456789-0101', t)).toBe('123456789-0101');
  });

  it("works the preview's VAT out as the server does: included, half up to the paisa", () => {
    // 449 x 15 / 115 = 58.5652...
    expect(includedVat(44_900, 15)).toBe('58.57');
    expect(includedVat(50_000, 15)).toBe('65.22');
    expect(includedVat(44_900, 7.5)).toBe('31.33');
  });
});

describe("the credential uses' CSV (SEC-11)", () => {
  it('offers the last 30 days in Dhaka, today included', () => {
    // 21 Oct 2026, 03:12 in Dhaka.
    expect(lastThirtyDays(new Date('2026-10-20T21:12:00.000Z'))).toEqual({
      dateFrom: '2026-09-22',
      dateTo: '2026-10-21',
    });
  });

  it('asks only for days in order, both given', () => {
    expect(daysInOrder('2026-10-01', '2026-10-21')).toBe(true);
    expect(daysInOrder('2026-10-21', '2026-10-21')).toBe(true);
    expect(daysInOrder('2026-10-21', '2026-10-01')).toBe(false);
    expect(daysInOrder('', '2026-10-21')).toBe(false);
  });
});
