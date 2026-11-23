import { useQuery } from '@tanstack/react-query';
import type { ConsumerMetric, SalesBucket } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { ConsumersReport, RevenueReport, ShopsReport } from '@/types/records';

/** ADM-09 (Slice 8.4): whole Dhaka days, split into Saturday weeks, months, quarters or years. */
export interface ReportPeriod {
  dateFrom: string;
  dateTo: string;
}

export type ReportKind = 'revenue' | 'shops' | 'consumers';

function queryOf(period: ReportPeriod, more: Record<string, string>): string {
  return new URLSearchParams({
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    ...more,
  }).toString();
}

/** D8-40: what Lytro earned in the period, split by `bucket`. */
export function useRevenueReport(period: ReportPeriod, bucket: SalesBucket, enabled = true) {
  return useQuery({
    queryKey: ['operator', 'reports', 'revenue', period, bucket],
    queryFn: () =>
      operatorSession.client.get<RevenueReport>(
        `/operator/reports/revenue?${queryOf(period, { bucket })}`,
      ),
    enabled,
  });
}

/** PAYG-FAIR-USE-PLAN PF-38: one pay-as-you-go shop's last 30 days. */
export interface PaygFairUseRow {
  tenantId: string;
  shopName: string;
  slug: string;
  received: number;
  opened: number;
  confirmed: number;
  /** Opened as a whole percent of received; null with none received. */
  openRate: number | null;
  apiRequests: number;
  apiCharged: string;
  feesEarned: string;
  balance: string;
  storefrontActive: boolean;
  watch: boolean;
}

export interface PaygFairUseReport {
  fairUseOn: boolean;
  from: string;
  to: string;
  rows: PaygFairUseRow[];
}

/** PF-16, PF-38: GET /operator/reports/payg-fair-use, sorted by orders received. */
export function usePaygFairUseReport() {
  return useQuery({
    queryKey: ['operator', 'reports', 'payg-fair-use'],
    queryFn: () => operatorSession.client.get<PaygFairUseReport>('/operator/reports/payg-fair-use'),
  });
}

/** D8-41: shops by state and plan now, and those that opened, first paid and lapsed in the period. */
export function useShopsReport(period: ReportPeriod, bucket: SalesBucket, enabled = true) {
  return useQuery({
    queryKey: ['operator', 'reports', 'shops', period, bucket],
    queryFn: () =>
      operatorSession.client.get<ShopsReport>(
        `/operator/reports/shops?${queryOf(period, { bucket })}`,
      ),
    enabled,
  });
}

/** D8-42: the 20 shops that used most of one thing in the period, each with its owner's phone. */
export function useConsumersReport(period: ReportPeriod, metric: ConsumerMetric, enabled = true) {
  return useQuery({
    queryKey: ['operator', 'reports', 'consumers', period, metric],
    queryFn: () =>
      operatorSession.client.get<ConsumersReport>(
        `/operator/reports/consumers?${queryOf(period, { metric })}`,
      ),
    enabled,
  });
}

/**
 * One report as the server's CSV, named as the server names it (`lytro-<kind>-<from>-to-<to>-<split>.csv`): the split is
 * the bucket, or the metric for the top consumers.
 */
export async function reportCsv(
  kind: ReportKind,
  period: ReportPeriod,
  split: SalesBucket | ConsumerMetric,
): Promise<{ name: string; file: Blob }> {
  const key = kind === 'consumers' ? 'metric' : 'bucket';
  const file = await operatorSession.client.file(
    `/operator/reports/${kind}/export?${queryOf(period, { [key]: split })}`,
  );
  return { name: `lytro-${kind}-${period.dateFrom}-to-${period.dateTo}-${split}.csv`, file };
}
