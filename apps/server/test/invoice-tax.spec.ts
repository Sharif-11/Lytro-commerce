import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InvoiceKind,
  PlatformSettingKey,
  PUBLISHED_PRIVACY_VERSIONS,
  PUBLISHED_TERMS_VERSIONS,
  isPrintedLine,
  isVatBin,
  isVatRate,
} from '@lytronix/validators';
import { fromPaisa, includedTaxOf, toPaisa } from '../src/modules/balance/services/money';
import { InvoiceTax } from '../src/modules/payments/services/invoice-tax';
import type { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import type { InvoiceRecord } from '../src/modules/payments/types/invoice';

// D9-7, LEG-03 (Phase 9 Slice 9.8): VAT included in the price, worked out once at issue, none until Lytro is registered and
// none on what the balance paid; and LEG-01's versions kept in step with the migration that sets them.

/** The platform settings as `values` hold them; a key not named is unset. */
function settingsOf(
  values: Partial<Record<PlatformSettingKey, string | number>>,
): PlatformSettingsService {
  return {
    current: (key: PlatformSettingKey) =>
      Promise.resolve(
        key in values
          ? { key, value: values[key], description: '', updatedBy: null, updatedAt: new Date() }
          : null,
      ),
  } as unknown as PlatformSettingsService;
}

const REGISTERED: Partial<Record<PlatformSettingKey, string>> = {
  [PlatformSettingKey.VatBin]: '123456789-0101',
  [PlatformSettingKey.VatRate]: '15',
  [PlatformSettingKey.VatSellerName]: 'Lytro',
  [PlatformSettingKey.VatSellerAddress]: 'Dhaka',
};

describe('the VAT an amount includes (TAX-02, D9-7)', () => {
  it('is amount x rate / (100 + rate), rounded half away from zero to the paisa', () => {
    expect(fromPaisa(includedTaxOf(toPaisa('500.00'), '15'))).toBe('65.22');
    expect(fromPaisa(includedTaxOf(toPaisa('449.00'), '15'))).toBe('58.57');
    expect(fromPaisa(includedTaxOf(toPaisa('115.00'), '15'))).toBe('15.00');
    expect(fromPaisa(includedTaxOf(toPaisa('107.50'), '7.5'))).toBe('7.50');
    // 0.10 x 15 / 115 = 0.013..., to a paisa; 0.12 x 15 / 115 = 0.0156..., up to two.
    expect(includedTaxOf(10n, '15')).toBe(1n);
    expect(includedTaxOf(12n, '15')).toBe(2n);
    expect(includedTaxOf(-50000n, '15')).toBe(-6522n);
    expect(includedTaxOf(50000n, '0')).toBe(0n);
  });
});

describe("Lytro's VAT on a new invoice (D9-7)", () => {
  it('carries none until all four settings are set', async () => {
    const keys = [
      PlatformSettingKey.VatBin,
      PlatformSettingKey.VatRate,
      PlatformSettingKey.VatSellerName,
      PlatformSettingKey.VatSellerAddress,
    ];
    for (const unset of keys) {
      const partial: Partial<Record<PlatformSettingKey, string>> = {};
      for (const key of keys) if (key !== unset) partial[key] = REGISTERED[key];
      expect(await new InvoiceTax(settingsOf(partial)).forNew('500.00', 'wallet')).toBeNull();
      const cleared = { ...REGISTERED, [unset]: '' };
      expect(await new InvoiceTax(settingsOf(cleared)).forNew('500.00', 'wallet')).toBeNull();
    }
  });

  it('carries the seller as registered, the rate and the VAT included, on money paid by wallet or bank', async () => {
    const tax = new InvoiceTax(settingsOf(REGISTERED));
    const vat = {
      sellerName: 'Lytro',
      sellerAddress: 'Dhaka',
      sellerBin: '123456789-0101',
      vatRate: '15',
      vatAmount: '65.22',
    };
    expect(await tax.forNew('500.00', 'wallet')).toEqual(vat);
    expect(await tax.forNew('500.00', 'bank')).toEqual(vat);
  });

  it('reads a rate or BIN the settings hand back as a number as the text it was saved as', async () => {
    const numbers = {
      ...REGISTERED,
      [PlatformSettingKey.VatRate]: 7.5,
      [PlatformSettingKey.VatBin]: 123456789,
    };
    expect(await new InvoiceTax(settingsOf(numbers)).forNew('107.50', 'wallet')).toMatchObject({
      sellerBin: '123456789',
      vatRate: '7.5',
      vatAmount: '7.50',
    });
  });

  it('carries none on what the balance paid: the top-up that filled it carried its VAT', async () => {
    expect(await new InvoiceTax(settingsOf(REGISTERED)).forNew('500.00', 'balance')).toBeNull();
  });

  it("takes back a credit note's invoice's VAT, negated, whatever the settings say now", () => {
    const tax = new InvoiceTax(settingsOf({}));
    const invoice = {
      kind: InvoiceKind.TopUp,
      sellerName: 'Lytro',
      sellerAddress: 'Dhaka',
      sellerBin: '123456789',
      vatRate: '15.00',
      vatAmount: '65.22',
    } as InvoiceRecord;
    expect(tax.takenBack(invoice)).toEqual({
      sellerName: 'Lytro',
      sellerAddress: 'Dhaka',
      sellerBin: '123456789',
      vatRate: '15.00',
      vatAmount: '-65.22',
    });
    expect(tax.takenBack({ ...invoice, vatAmount: null })).toBeNull();
  });
});

describe('what the VAT settings may hold (D9-7, SEC-13)', () => {
  it('takes a BIN of 9 or 13 digits, with or without the branch hyphen', () => {
    for (const bin of ['123456789', '1234567890123', '123456789-0101'])
      expect(isVatBin(bin)).toBe(true);
    for (const bin of ['12345678', '1234567890', '123456789-01', 'ABCDEFGHI', 123456789]) {
      expect(isVatBin(bin)).toBe(false);
    }
  });

  it('takes a rate above 0 and up to 100, with at most two decimals', () => {
    for (const rate of ['15', '7.5', '7.50', '0.01', '100']) expect(isVatRate(rate)).toBe(true);
    for (const rate of ['0', '0.00', '100.01', '7.555', '-5', '15%', 15]) {
      expect(isVatRate(rate)).toBe(false);
    }
  });

  it('takes a printed line with no control characters, no edge spaces, within its length', () => {
    expect(isPrintedLine('Lytro', 120)).toBe(true);
    for (const line of ['', ' Lytro', 'Lytro ', 'Ly\ntro', 'Ly\u0007tro', 'x'.repeat(121)]) {
      expect(isPrintedLine(line, 120)).toBe(false);
    }
  });
});

describe('the versions sign-up records (LEG-01, Slice 9.8)', () => {
  it('are set by the newest migration that sets them, to the newest published versions', () => {
    const folder = join(__dirname, '../../../packages/db/drizzle');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const newest = (key: string): string | undefined => {
      let found: string | undefined;
      const sets = new RegExp(
        `'"(\\d{4}-\\d{2}-\\d{2})"'[^;]*?'${key}'|'${key}'[^;]*?'"(\\d{4}-\\d{2}-\\d{2})"'`,
        's',
      );
      for (const name of files) {
        for (const statement of readFileSync(join(folder, name), 'utf8').split(';')) {
          const match = sets.exec(statement);
          if (match) found = match[1] ?? match[2];
        }
      }
      return found;
    };
    expect(newest('terms_version')).toBe(
      PUBLISHED_TERMS_VERSIONS[PUBLISHED_TERMS_VERSIONS.length - 1],
    );
    expect(newest('privacy_version')).toBe(
      PUBLISHED_PRIVACY_VERSIONS[PUBLISHED_PRIVACY_VERSIONS.length - 1],
    );
  });
});
