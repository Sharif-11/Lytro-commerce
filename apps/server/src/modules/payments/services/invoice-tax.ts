import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingKey, type PaidByMethod } from '@lytronix/validators';
import { fromPaisa, includedTaxOf, toPaisa } from '../../balance/services/money';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { InvoiceVat } from '../ports/invoices-store';
import type { InvoiceRecord } from '../types/invoice';

/** D9-7: Lytro's VAT registration as the four platform settings hold it. */
interface VatRegistration {
  sellerName: string;
  sellerAddress: string;
  sellerBin: string;
  vatRate: string;
}

/**
 * D9-7, LEG-03 (Phase 9 Slice 9.8): the VAT a new invoice carries. None until the operator has set all four of Lytro's VAT
 * settings, so registering later needs no code. Prices include the VAT (the read, 2026-11-13): an invoice shows the part of
 * its amount that is VAT, and its total never changes. An invoice paid from the balance carries none -- the money came in
 * by a top-up, whose own invoice carried its VAT. A credit note carries its invoice's VAT, taken back.
 */
@Injectable()
export class InvoiceTax {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /** The VAT on a new invoice of `amount`, paid by `paidBy`; null when it carries none. */
  async forNew(amount: string, paidBy: PaidByMethod): Promise<InvoiceVat | null> {
    if (paidBy === 'balance') return null;
    const registration = await this.registration();
    if (!registration) return null;
    return {
      ...registration,
      vatAmount: fromPaisa(includedTaxOf(toPaisa(amount), registration.vatRate)),
    };
  }

  /** A credit note's VAT: the invoice it takes back's, negated -- as that invoice was issued, whatever the settings say now. */
  takenBack(invoice: InvoiceRecord): InvoiceVat | null {
    const { sellerName, sellerAddress, sellerBin, vatRate, vatAmount } = invoice;
    if (
      sellerName === null ||
      sellerAddress === null ||
      sellerBin === null ||
      vatRate === null ||
      vatAmount === null
    ) {
      return null;
    }
    return {
      sellerName,
      sellerAddress,
      sellerBin,
      vatRate,
      vatAmount: fromPaisa(-toPaisa(vatAmount)),
    };
  }

  /** All four settings, or null while any is unset or cleared. Read one after another, each usually from the cache. */
  private async registration(): Promise<VatRegistration | null> {
    const bin = await this.setting(PlatformSettingKey.VatBin);
    const rate = await this.setting(PlatformSettingKey.VatRate);
    const name = await this.setting(PlatformSettingKey.VatSellerName);
    const address = await this.setting(PlatformSettingKey.VatSellerAddress);
    if (bin === null || rate === null || name === null || address === null) return null;
    return { sellerName: name, sellerAddress: address, sellerBin: bin, vatRate: rate };
  }

  /**
   * A setting as the text the operator saved. A text that reads as a number -- a rate of "15", a BIN of nine digits -- comes
   * back from the settings' jsonb as that number, so it is turned back into its text.
   */
  private async setting(key: PlatformSettingKey): Promise<string | null> {
    const value = (await this.settings.current(key))?.value;
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value !== '' ? value : null;
  }
}
