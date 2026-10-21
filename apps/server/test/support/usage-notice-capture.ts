import type { Transaction } from '@lytronix/db';
import type { UsageMetric } from '@lytronix/validators';
import type { UsageLevel } from '../../src/common/usage-warnings';
import type { UsageNotices } from '../../src/modules/usage-warnings/ports/usage-notices';
import type { UsageNotice } from '../../src/modules/usage-warnings/types/usage-notice';

/** Keeps every usage notice queued (LIM-01), in place of the job queue, so a test reads what was decided. */
export class UsageNoticeCapture implements UsageNotices {
  readonly notices: UsageNotice[] = [];

  queue(_tx: Transaction, notice: UsageNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  /** The levels a shop was told of, in order, for one metric or all. */
  levelsFor(tenantId: string, metric?: UsageMetric): UsageLevel[] {
    return this.notices
      .filter((notice) => notice.tenantId === tenantId && (!metric || notice.metric === metric))
      .map((notice) => notice.level);
  }
}
