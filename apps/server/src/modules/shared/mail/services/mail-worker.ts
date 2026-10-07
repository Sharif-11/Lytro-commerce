import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { SECOND_MS } from '../../../../common/time';
import { MailService } from './mail.service';

// Sends messages whose retry time has come (D28, mirrors SmsWorker). Not started under NODE_ENV=test, where
// tests call runDue directly.
export const WORKER_INTERVAL_MS = 30 * SECOND_MS;

@Injectable()
export class MailWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(MailService) private readonly mail: MailService) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.timer = setInterval(() => {
      this.mail.runDue().catch((error: unknown) => {
        console.error(
          `[mail] worker run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
