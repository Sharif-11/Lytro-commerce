import { ConsumerMetric, SPENT_LEDGER_TYPES } from '@lytronix/validators';
import { toCsv, type CsvValue } from '../../../common/csv';
import type { ConsumersReport, RevenueReport, ShopsReport } from './reports';
import { WALLET_EARNED_KINDS } from './reports';

// ADM-09, D8-10 (Phase 8 Slice 8.4): each report as a CSV, one row a bucket (or a shop) and a total, the same figures the
// console shows. A leading byte-order mark lets a spreadsheet read the Bangla and the taka sign as UTF-8.
const BOM = '\uFEFF';

export function revenueCsv(report: RevenueReport): string {
  // Prefixed, since a wallet's add-on payment and the ledger's add-on charge are both `addon`.
  const wallet = WALLET_EARNED_KINDS.map((kind) => `wallet_${kind}`);
  const balance = SPENT_LEDGER_TYPES.map((type) => `balance_${type}`);
  const manual = [
    'manual_plans',
    'manual_plans_reversed',
    'manual_top_ups',
    'manual_top_ups_reversed',
  ];
  const columns = ['from', 'to', ...wallet, ...balance, 'given_back', ...manual, 'earned'];
  const rows = [
    ...report.buckets,
    { from: report.dateFrom, to: report.dateTo, ...report.total },
  ].map((bucket) => {
    const row: Record<string, CsvValue> = { from: bucket.from, to: bucket.to };
    for (const kind of WALLET_EARNED_KINDS) row[`wallet_${kind}`] = bucket.wallet[kind];
    for (const type of SPENT_LEDGER_TYPES) row[`balance_${type}`] = bucket.balance[type] ?? '0.00';
    row['given_back'] = bucket.givenBack;
    row['manual_plans'] = bucket.manual.plans;
    row['manual_plans_reversed'] = bucket.manual.plansReversed;
    row['manual_top_ups'] = bucket.manual.topUps;
    row['manual_top_ups_reversed'] = bucket.manual.topUpsReversed;
    row['earned'] = bucket.earned;
    return row;
  });
  return BOM + toCsv(rows, columns);
}

/** A plan line of today's counts in the CSV: pay-as-you-go is its own line (ADM-09, PYG-13), as in the JSON. */
const PAY_AS_YOU_GO_LINE = 'pay_as_you_go';
/** A shop on no plan at all. */
const NO_PLAN_LINE = 'none';

/**
 * D8-41, D8-46: each period's movements and their total, then today's counts by state and by plan, each its own table
 * after a blank line, so the file carries every figure the JSON's `now` does.
 */
export function shopsCsv(report: ShopsReport): string {
  const rows = [
    ...report.buckets,
    { from: report.dateFrom, to: report.dateTo, ...report.total },
  ].map((bucket) => ({
    from: bucket.from,
    to: bucket.to,
    opened: bucket.opened,
    became_paying: bucket.becamePaying,
    lapsed: bucket.lapsed,
  }));
  const byState = report.now.byState.map((row) => ({ state: row.state, shops: row.count }));
  const byPlan = report.now.byPlan.map((row) => ({
    plan: row.payAsYouGo ? PAY_AS_YOU_GO_LINE : (row.planName ?? NO_PLAN_LINE),
    shops: row.count,
  }));
  return (
    BOM +
    [
      toCsv(rows, ['from', 'to', 'opened', 'became_paying', 'lapsed']),
      toCsv(byState, ['state', 'shops']),
      toCsv(byPlan, ['plan', 'shops']),
    ].join('\n\n')
  );
}

/** D8-42: each shop with its owner's phone (the owner's pick), so the operator can call a heavy user; D8-46: and a total. */
export function consumersCsv(report: ConsumersReport): string {
  const unit = report.metric === ConsumerMetric.Sms ? 'sms_units' : 'bytes';
  const rows: Record<string, CsvValue>[] = report.shops.map((shop) => ({
    shop: shop.name,
    address: shop.slug,
    owner_phone: shop.ownerPhone,
    [unit]: shop.value,
  }));
  rows.push({ shop: 'total', [unit]: report.shops.reduce((sum, shop) => sum + shop.value, 0) });
  return BOM + toCsv(rows, ['shop', 'address', 'owner_phone', unit]);
}

/** A report's file name: what it is, its period and its split (`lytro-revenue-2026-11-01-to-2026-11-30-month.csv`). */
export function reportFileName(
  kind: string,
  report: { dateFrom: string; dateTo: string },
  split: string,
): string {
  return `lytro-${kind}-${report.dateFrom}-to-${report.dateTo}-${split}.csv`;
}
