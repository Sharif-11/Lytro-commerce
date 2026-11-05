import { useQuery } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import { fetchPaymentQueue, PAYMENT_QUEUE_QUERY_KEY } from './payment-queue';

// The frame's counts stay current while the console sits open, without anyone reloading it.
const REFRESH_MS = 60_000;
// The most reports the server lists at once (paymentPageReportListSchema).
const REPORTS_COUNTED = 100;

export interface ShellCounts {
  queue: number;
  reports: number;
}

/** Rule 1: the queue's count and the open page reports' count, on their navigation items. */
export function useShellCounts(): ShellCounts {
  const queue = useQuery({
    queryKey: [...PAYMENT_QUEUE_QUERY_KEY, 'all'],
    queryFn: () => fetchPaymentQueue(null),
    refetchInterval: REFRESH_MS,
  });
  const reports = useQuery({
    queryKey: ['operator', 'payment-page-reports', 'open-count'],
    queryFn: () =>
      operatorSession.client.get<{ reports: unknown[] }>(
        `/operator/payment-page-reports?status=open&limit=${String(REPORTS_COUNTED)}`,
      ),
    refetchInterval: REFRESH_MS,
  });
  return { queue: queue.data?.length ?? 0, reports: reports.data?.reports.length ?? 0 };
}
