import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { DataExportService } from '../../../data-export/services/data-export.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

interface DataExportPayload {
  exportId: string;
  tenantId: string;
}

/** LIF-16: generates the owner's requested export in the background. One job per request, enqueued by
 * `DataExportService.request` in the same transaction as the row it belongs to (SCL-08). */
@Injectable()
export class DataExportWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(DataExportService) private readonly exports: DataExportService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.DataExport);
    await this.pgBoss.boss.work<DataExportPayload>(QueueName.DataExport, async (jobs) => {
      for (const job of jobs) {
        await this.exports.generate(job.data.tenantId, job.data.exportId);
      }
    });
  }
}
