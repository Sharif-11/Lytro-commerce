import { useInfiniteQuery } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import type { AuditPage } from '@/types/records';

/** ADM-08, D8-11 (Slice 8.4): what the audit log is narrowed to, as GET /operator/audit takes it. */
export interface AuditFilters {
  tenantId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** A page of the sketch's "Load 20 more". */
export const AUDIT_PAGE_SIZE = 20;

/** The platform audit log, newest first, in keyset pages; each filter change starts a fresh list. */
export function useAuditLog(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['operator', 'audit', filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (typeof value === 'string' && value !== '') params.set(key, value);
      }
      params.set('limit', String(AUDIT_PAGE_SIZE));
      if (pageParam !== undefined) params.set('cursor', String(pageParam));
      return operatorSession.client.get<AuditPage>(`/operator/audit?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });
}
