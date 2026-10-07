// What the Activity page reads (AUD-02, AUD-04). The name is resolved from the staff table, not stored on the
// entry, so a later name change is reflected without rewriting history.
export interface ActivityEntryView {
  id: string;
  tenantId: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  summary: unknown;
  createdAt: string;
}

export interface ActivityPageView {
  entries: ActivityEntryView[];
  nextCursor: string | null;
}
