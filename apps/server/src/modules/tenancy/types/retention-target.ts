/** A shop and the days its activity log is kept, for the purge job (AUD-06). */
export interface RetentionTarget {
  tenantId: string;
  retentionDays: number | null;
}
