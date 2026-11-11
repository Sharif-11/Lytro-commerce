import { createFileRoute } from '@tanstack/react-router';
import type { AuditFilters } from '@/api/audit';
import { AuditLog } from '@/views/audit';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;
const ACTION = /^[a-z0-9_]{1,64}$/;

export const Route = createFileRoute('/_console/audit')({
  // ADM-08, D8-11 (§10f): the filters live in the address, so a shop's page can open its own entries.
  validateSearch: (search: Record<string, unknown>): AuditFilters => {
    const pick = (key: keyof AuditFilters, rule: RegExp): Partial<AuditFilters> => {
      const value = search[key];
      return typeof value === 'string' && rule.test(value) ? { [key]: value } : {};
    };
    return {
      ...pick('tenantId', ID),
      ...pick('actorId', ID),
      ...pick('action', ACTION),
      ...pick('dateFrom', DAY),
      ...pick('dateTo', DAY),
    };
  },
  component: AuditLog,
});
