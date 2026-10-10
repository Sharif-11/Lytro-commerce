/** Mirrors `ActivityEntryView`/`ActivityPageView` in
    apps/server/src/modules/team/types/activity-view.ts — see types/me.ts's own note on why this is a
    deliberate structural duplicate, not an import. */
export interface ActivityEntry {
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

export interface ActivityPage {
  entries: ActivityEntry[];
  nextCursor: string | null;
}
