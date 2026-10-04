import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MessagingService } from './messaging.service';

// Sends messages whose retry time has come. Not started under NODE_ENV=test, where tests call runDue directly.
export const WORKER_INTERVAL_MS = 30_000;

@Injectable()
export class SmsWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly messaging: MessagingService) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.timer = setInterval(() => {
      this.messaging.runDue().catch((error: unknown) => {
        console.error(
          `[sms] worker run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
