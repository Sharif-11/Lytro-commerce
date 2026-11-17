import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// Scheduled jobs whose work is gone. pg-boss keeps a schedule in the database, so one dropped from the code goes on
// making a job every minute with nobody to work it; each server's start cancels these and removes their queues.
// D9-31: the media Worker's minute pass, gone with the Worker.
export const RETIRED_SCHEDULES: readonly QueueName[] = [QueueName.MediaBandwidthTick];

/** Cancels the schedules of retired jobs, and their queues with any job left in them. Safe to run on every start. */
@Injectable()
export class RetiredSchedulesWorker implements OnModuleInit {
  private readonly logger = new Logger('RetiredSchedules');

  constructor(@Inject(PgBossClient) private readonly pgBoss: PgBossClient) {}

  async onModuleInit(): Promise<void> {
    for (const name of RETIRED_SCHEDULES) {
      await this.pgBoss.boss.unschedule(name);
      if (await this.pgBoss.boss.getQueue(name)) {
        await this.pgBoss.boss.deleteQueue(name);
        this.logger.log(`retired the ${name} queue`);
      }
    }
  }
}
