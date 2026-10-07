import type { SelectActivityLog } from '@lytronix/db';

// The log row as stored. An alias of the shared type (ENGINEERING-STANDARDS §4), never a copy.
export type ActivityRecord = SelectActivityLog;

export interface ActivityFilters {
  dateFrom?: Date;
  dateTo?: Date;
  actorId?: string;
  action?: string;
}

export interface ActivityCursor {
  createdAt: Date;
  id: number;
}

export interface ActivityPage {
  entries: ActivityRecord[];
  // The cursor for the next page, or null when this page was the last one.
  nextCursor: ActivityCursor | null;
}

// What a write gives the log (AUD-01, AUD-02). The caller decides actorId, action, target and summary; the writer
// never receives a password, OTP or key, and never stores one.
export interface AuditEntry {
  tenantId: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: string;
  summary?: unknown;
}
