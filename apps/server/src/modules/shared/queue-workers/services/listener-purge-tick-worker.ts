import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { ListenerDevices } from '../../../listener/services/listener-devices';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// LSN-05: once a day, in the quiet hours.
const LISTENER_PURGE_CRON = '23 3 * * *';

/**
 * Registers the listener purge (Phase 5 Slice 5.4a): spent or lapsed pairing codes a day old and phones revoked [30]
 * days ago are removed. Safe to run twice.
 */
@Injectable()
export class ListenerPurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ListenerPurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(ListenerDevices) private readonly devices: ListenerDevices,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ListenerPurgeTick);
    await this.pgBoss.boss.schedule(QueueName.ListenerPurgeTick, LISTENER_PURGE_CRON, {});
    await this.pgBoss.boss.work(QueueName.ListenerPurgeTick, async () => {
      const purged = await this.devices.purge(new Date());
      if (purged.codes + purged.devices > 0) {
        this.logger.log(
          `listener purge: ${String(purged.codes)} codes, ${String(purged.devices)} revoked phones`,
        );
      }
    });
  }
}
