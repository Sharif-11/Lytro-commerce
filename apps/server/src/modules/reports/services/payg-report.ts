import { Inject, Injectable } from '@nestjs/common';
import { LedgerEntryType } from '@lytronix/validators';
import { DAY_MS, dhakaDate } from '../../../common/time';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { FairUseSwitch } from '../../fair-use/services/fair-use-switch';
import type { PaygReportStore } from '../ports/payg-report-store';
import { PAYG_REPORT_STORE, REPORTS_CLOCK } from '../tokens';

/** PF-38: the report covers the last 30 days. */
const REPORT_DAYS = 30;
/** PF-38: a shop with this many orders from Lytro or more, of which fewer than this share were opened, is watched. */
const WATCH_MIN_ORDERS = 20;
const WATCH_OPEN_RATE = 25;

// What a shop pays for using Lytro, as opposed to money it put in or a plan it bought.
const FEE_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  LedgerEntryType.OrderUnlock,
  LedgerEntryType.ApiRequests,
  LedgerEntryType.OrderFee,
  LedgerEntryType.ProductFee,
  LedgerEntryType.Sms,
  LedgerEntryType.FraudCheck,
  LedgerEntryType.Extraction,
  LedgerEntryType.VerificationFee,
  LedgerEntryType.Ai,
]);

/** One pay-as-you-go shop's last 30 days. */
export interface PaygFairUseRow {
  tenantId: string;
  shopName: string;
  slug: string;
  /** Orders that came through Lytro (storefront, landing pages, the API), those opened, those confirmed. */
  received: number;
  opened: number;
  confirmed: number;
  /** Opened as a percent of received; null with none received. */
  openRate: number | null;
  /** Its own website's API requests, the successful ones, and what they were charged. */
  apiRequests: number;
  apiCharged: string;
  /** Every fee it paid Lytro. */
  feesEarned: string;
  balance: string;
  /** Its storefront is on: it paid a plan or the activation top-up. */
  storefrontActive: boolean;
  /** Many orders and few opened: maybe taking orders and handling them outside Lytro. */
  watch: boolean;
}

export interface PaygFairUseReport {
  fairUseOn: boolean;
  from: Date;
  to: Date;
  rows: PaygFairUseRow[];
}

/**
 * PYG-13 as amended (PAYG-FAIR-USE-PLAN PF-16, PF-38, PFQ-7): every pay-as-you-go shop over the last 30 days -- orders from
 * Lytro received, opened and confirmed, its API use and charges, every fee, its balance and whether its storefront is on.
 * A shop with 20 or more orders and fewer than a quarter opened is marked to watch. Sorted by orders received. Storefront
 * visits are Cloudflare's to answer, so they aren't counted.
 */
@Injectable()
export class PaygReport {
  constructor(
    @Inject(PAYG_REPORT_STORE) private readonly store: PaygReportStore,
    @Inject(FairUseSwitch) private readonly fairUse: FairUseSwitch,
    @Inject(REPORTS_CLOCK) private readonly clock: () => Date,
  ) {}

  async fairUseReport(): Promise<PaygFairUseReport> {
    const to = this.clock();
    const from = new Date(to.getTime() - REPORT_DAYS * DAY_MS);
    const rows: PaygFairUseRow[] = [];
    for (const shop of await this.store.shops()) {
      const [counts, totals, api] = [
        await this.store.orderCounts(shop.id, from),
        await this.store.ledgerTotals(shop.id, from, to),
        await this.store.apiSince(shop.id, dhakaDate(from)),
      ];
      const charged = (types: (type: LedgerEntryType) => boolean): string =>
        fromPaisa(
          totals
            .filter((row) => types(row.type))
            .reduce((sum, row) => sum + toPaisa(row.charged) - toPaisa(row.returned), 0n),
        );
      const openRate =
        counts.received === 0 ? null : Math.round((counts.opened * 100) / counts.received);
      rows.push({
        tenantId: shop.id,
        shopName: shop.shopName,
        slug: shop.slug,
        ...counts,
        openRate,
        apiRequests: api.billable,
        apiCharged: charged((type) => type === LedgerEntryType.ApiRequests),
        feesEarned: charged((type) => FEE_TYPES.has(type)),
        balance: shop.balanceAmount,
        storefrontActive: shop.storefrontActivatedAt !== null,
        watch:
          counts.received >= WATCH_MIN_ORDERS && openRate !== null && openRate < WATCH_OPEN_RATE,
      });
    }
    rows.sort((a, b) => b.received - a.received);
    return { fairUseOn: await this.fairUse.isOn(), from, to, rows };
  }
}
