import { useQuery } from '@tanstack/react-query';
import type { HelpLineView } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';

export const HELP_LINE_QUERY_KEY = ['help-line'] as const;

/**
 * D8-4, D8-67 to D8-69 (Slice 8.8): Lytro's help line -- its WhatsApp, phone and hours, set in the console -- for the
 * Menu's Help and the error ID's Send on WhatsApp. Public and cached five minutes by the server, so read as rarely.
 */
export function useHelpLine() {
  return useQuery({
    queryKey: HELP_LINE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<HelpLineView>('/help-line'),
    staleTime: 5 * 60_000,
  });
}
