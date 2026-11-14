import { useQuery } from '@tanstack/react-query';
import { PaymentPageReportStatus } from '@lytronix/validators';
import { reportsQuery } from './page-reports';
import { openDifferencesQuery } from './reconciliation';
import { fetchPaymentQueue, PAYMENT_QUEUE_QUERY_KEY } from './payment-queue';

// The frame's counts stay current while the console sits open, without anyone reloading it.
const REFRESH_MS = 60_000;

export interface ShellCounts {
  queue: number;
  reports: number;
  /** Slice 9.9: the money check's open differences. */
  moneyCheck: number;
}

/** Rule 1: the queue's count and the open page reports' count, on their navigation items. */
export function useShellCounts(): ShellCounts {
  const queue = useQuery({
    queryKey: [...PAYMENT_QUEUE_QUERY_KEY, 'all'],
    queryFn: () => fetchPaymentQueue(null),
    refetchInterval: REFRESH_MS,
  });
  const reports = useQuery({
    ...reportsQuery(PaymentPageReportStatus.Open),
    refetchInterval: REFRESH_MS,
  });
  const moneyCheck = useQuery({ ...openDifferencesQuery(), refetchInterval: REFRESH_MS });
  return {
    queue: queue.data?.length ?? 0,
    reports: reports.data?.reports.length ?? 0,
    moneyCheck: moneyCheck.data ?? 0,
  };
}
