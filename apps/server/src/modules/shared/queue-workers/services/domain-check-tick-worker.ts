import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DOMAIN_CHECK_MINUTES, QueueName } from '@lytronix/validators';
import { DomainService } from '../../../domains/services/domain.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// TEN-11: every 10 minutes (DOMAIN_CHECK_MINUTES), on the clock.
const DOMAIN_CHECK_CRON = `*/${String(DOMAIN_CHECK_MINUTES)} * * * *`;

/**
 * Registers the recurring domain check (TEN-11, Slice 13), a cron like the expiry tick: no single business transaction
 * anchors it. A doubled run asks DNS twice and writes the same outcome, so it changes nothing.
 */
@Injectable()
export class DomainCheckTickWorker implements OnModuleInit {
  private readonly logger = new Logger('DomainCheckTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(DomainService) private readonly domains: DomainService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.DomainCheckTick);
    await this.pgBoss.boss.schedule(QueueName.DomainCheckTick, DOMAIN_CHECK_CRON, {});
    await this.pgBoss.boss.work(QueueName.DomainCheckTick, async () => {
      const run = await this.domains.runChecks(new Date());
      if (run.checked === 0) return;
      this.logger.log(
        `domain checks: ${String(run.checked)} checked, ${String(run.activated)} active, ${String(run.failed)} not verified, ${String(run.lost)} lost`,
      );
    });
  }
}
