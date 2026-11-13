import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MonitoringDatabase } from '../ports/monitoring-database';
import { MONITORING_CLOCK, MONITORING_DATABASE } from '../tokens';

/**
 * OBS-02 (Slice 9.6): a scheduled job says it finished a pass (PgBossClient.workOnce, after every pass that ran). The
 * jobs' check compares it with the job's schedule.
 */
@Injectable()
export class JobHeartbeats {
  private readonly logger = new Logger('JobHeartbeats');

  constructor(
    @Inject(MONITORING_DATABASE)
    private readonly database: Pick<MonitoringDatabase, 'recordHeartbeat'>,
    @Inject(MONITORING_CLOCK) private readonly clock: () => Date,
  ) {}

  /** Never fails the job: a heartbeat that couldn't be written shows as the job overdue, which is the truth to act on. */
  async finished(name: string): Promise<void> {
    try {
      await this.database.recordHeartbeat(name, this.clock());
    } catch (error) {
      this.logger.warn(`${name}: its heartbeat wasn't recorded: ${String(error)}`);
    }
  }
}
