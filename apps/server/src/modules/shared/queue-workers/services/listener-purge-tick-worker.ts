import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { ListenerDevices } from '../../../listener/services/listener-devices';
import { ListenerReceipts } from '../../../listener-receipts/services/listener-receipts';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// LSN-05: once a day, in the quiet hours of Asia/Dhaka (with no zone pg-boss read it as UTC: found at the close-out).
const LISTENER_PURGE_CRON = '23 3 * * *';
const LISTENER_PURGE_TZ = 'Asia/Dhaka';

/**
 * Registers the listener purge (Phase 5 Slice 5.4a): spent or lapsed pairing codes a day old and phones revoked [30]
 * days ago are removed, and (Slice 5.4b, LSN-17) receipt text past [90] days is redacted. Safe to run twice.
 */
@Injectable()
export class ListenerPurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ListenerPurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(ListenerDevices) private readonly devices: ListenerDevices,
    @Inject(ListenerReceipts) private readonly receipts: ListenerReceipts,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ListenerPurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.ListenerPurgeTick,
      LISTENER_PURGE_CRON,
      {},
      { tz: LISTENER_PURGE_TZ },
    );
    await this.pgBoss.boss.work(QueueName.ListenerPurgeTick, async () => {
      const now = new Date();
      const purged = await this.devices.purge(now);
      const redacted = await this.receipts.redactOld(now);
      if (redacted.redacted + redacted.removed > 0) {
        this.logger.log(
          `listener redaction: ${String(redacted.redacted)} texts, ${String(redacted.removed)} removed`,
        );
      }
      if (purged.codes + purged.devices > 0) {
        this.logger.log(
          `listener purge: ${String(purged.codes)} codes, ${String(purged.devices)} revoked phones`,
        );
      }
    });
  }
}
