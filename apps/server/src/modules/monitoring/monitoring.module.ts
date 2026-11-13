import { Global, Module } from '@nestjs/common';
import { DrizzleMonitoringDatabase } from '../../database/adapters/monitoring.adapter';
import { JobsCheckController } from './controllers/jobs-check.controller';
import { JobHeartbeats } from './services/job-heartbeats';
import { JobsCheck } from './services/jobs-check';
import { MONITORING_CLOCK, MONITORING_DATABASE } from './tokens';

/**
 * Slice 9.6 (OBS-02, DAT-27): the jobs' heartbeats and the check that reads them. Global, so the job queue records a
 * heartbeat after each pass without importing it.
 */
@Global()
@Module({
  controllers: [JobsCheckController],
  providers: [
    { provide: MONITORING_DATABASE, useClass: DrizzleMonitoringDatabase },
    { provide: MONITORING_CLOCK, useValue: (): Date => new Date() },
    JobHeartbeats,
    JobsCheck,
  ],
  exports: [JobHeartbeats],
})
export class MonitoringModule {}
