import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SmsEvent } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { SmsLogRow, SmsReport, SmsSettings } from '@/types/sms';

// Settings › SMS (TENANT-DASHBOARD-DESIGN §7.40, Part 37; SMS-02 to SMS-19, Phase 7 Slices 7.1 and 7.2): the ten SMS, the
// SMS name, the monthly cap, the log and the report. sms:read sees them; sms:manage changes them.

export const SMS_QUERY_KEY = ['sms'] as const;

export function useSmsSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...SMS_QUERY_KEY, 'settings'],
    queryFn: () => tenantSession.client.get<SmsSettings>('/sms/settings'),
    enabled: options.enabled ?? true,
  });
}

/** PATCH /sms/settings: any of the switches, the templates, the SMS name and the cap; answers the settings. */
export interface SmsSettingsChange {
  events?: Partial<Record<SmsEvent, boolean>>;
  templates?: Partial<Record<SmsEvent, string>>;
  smsName?: string | null;
  monthlySpendCap?: number | null;
}

export function useSaveSmsSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: SmsSettingsChange) =>
      tenantSession.client.patch<SmsSettings>('/sms/settings', change),
    onSuccess: (saved) => {
      queryClient.setQueryData([...SMS_QUERY_KEY, 'settings'], saved);
    },
  });
}

/** POST /sms/settings/templates/:event/reset (SMS-19): back to Lytro's words. */
export function useResetSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: SmsEvent) =>
      tenantSession.client.post<SmsSettings>(
        `/sms/settings/templates/${encodeURIComponent(event)}/reset`,
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData([...SMS_QUERY_KEY, 'settings'], saved);
    },
  });
}

const LOG_PAGE = 30;

/** GET /sms/log (SMS-07, SMS-17): newest first, a page at a time; one order's alone when named. */
export function useSmsLog(options: { orderId?: string; enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: [...SMS_QUERY_KEY, 'log', options.orderId ?? null],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(LOG_PAGE) });
      if (pageParam !== null) query.set('before', String(pageParam));
      if (options.orderId) query.set('orderId', options.orderId);
      return tenantSession.client.get<{ sms: SmsLogRow[] }>(`/sms/log?${query.toString()}`);
    },
    getNextPageParam: (last) =>
      last.sms.length < LOG_PAGE ? undefined : last.sms[last.sms.length - 1]?.id,
    enabled: options.enabled ?? true,
  });
}

/** GET /sms/report (SMS-14): the last 30 days, or the days picked (at most 92). */
export function useSmsReport(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...SMS_QUERY_KEY, 'report', range?.from ?? null, range?.to ?? null],
    queryFn: () => {
      const query = range ? `?dateFrom=${range.from}&dateTo=${range.to}` : '';
      return tenantSession.client.get<SmsReport>(`/sms/report${query}`);
    },
  });
}
