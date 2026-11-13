import { Inject, Injectable } from '@nestjs/common';
import { JobHeartbeatRepository, type ArchiveState, type ScheduledJobBeat } from '@lytronix/db';
import type { MonitoringDatabase } from '../../modules/monitoring/ports/monitoring-database';
import { DatabaseService } from '../database.service';

/** OBS-02, DAT-27 (Slice 9.6): Lytro's own table (migration 0134) and pg-boss's, on the write pool (the primary). */
@Injectable()
export class DrizzleMonitoringDatabase implements MonitoringDatabase {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(JobHeartbeatRepository) private readonly heartbeats: JobHeartbeatRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  recordHeartbeat(name: string, at: Date): Promise<void> {
    return this.heartbeats.record(this.db, name, at);
  }

  heartbeatsOf(names: readonly string[]): Promise<Map<string, Date>> {
    return this.heartbeats.finishedAt(this.db, names);
  }

  scheduledJobs(): Promise<ScheduledJobBeat[]> {
    return this.heartbeats.scheduledJobs(this.db);
  }

  archive(): Promise<ArchiveState> {
    return this.heartbeats.archive(this.db);
  }
}
