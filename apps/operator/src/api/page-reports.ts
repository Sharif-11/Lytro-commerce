import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentPageReportStatus } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { PaymentPageReport } from '@/types/operator';

export const PAGE_REPORTS_QUERY_KEY = ['operator', 'payment-page-reports'] as const;
// The most reports the server lists at once (paymentPageReportListSchema).
const REPORTS_READ = 100;

/** How one status's reports are read, for the screen and the frame's count alike. */
export function reportsQuery(status: PaymentPageReportStatus) {
  return {
    queryKey: [...PAGE_REPORTS_QUERY_KEY, status],
    queryFn: () =>
      operatorSession.client.get<{ reports: PaymentPageReport[] }>(
        `/operator/payment-page-reports?status=${status}&limit=${String(REPORTS_READ)}`,
      ),
  };
}

/** ADM-12: shoppers' reports with one status, newest first. */
export function usePageReports(status: PaymentPageReportStatus) {
  return useQuery(reportsQuery(status));
}

/** Nothing is done to the shop; the dismissal is audited. */
export function useDismissReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.post<{ ok: true }>(`/operator/payment-page-reports/${id}/dismiss`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PAGE_REPORTS_QUERY_KEY });
    },
  });
}
