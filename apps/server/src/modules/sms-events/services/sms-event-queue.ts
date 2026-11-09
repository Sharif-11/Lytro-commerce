import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName, type SmsEvent } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';

/** SMS-01: one SMS event of one order, the job that may send it. */
export interface SmsEventJob {
  tenantId: string;
  orderId: string;
  event: SmsEvent;
  /** A payment's own amount, for the payment events; an order's events say its total. */
  amount?: string;
}

/** What happened to an order, and each SMS event it may send. */
export type SmsEventsHappened = Omit<SmsEventJob, 'event'> & { events: SmsEvent[] };

/**
 * SMS-01, PHASE-7-PLAN §3.4 (Slice 7.2): the one way an order's event reaches its SMS. Called in the transaction where
 * the order changed, at the single place it changes, so the job commits with that change or not at all; everything
 * else (the shop's switches, the words, the charge, the send) happens apart from it, and never holds it up.
 * Each event is its own job, so a retry of one that failed can't send and charge again one that already went.
 */
@Injectable()
export class SmsEventQueue {
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  async queue(tx: Transaction, happened: SmsEventsHappened): Promise<void> {
    const { events, ...facts } = happened;
    for (const event of events) {
      const job: SmsEventJob = { ...facts, event };
      await this.jobs.enqueue(tx, QueueName.OrderSms, job);
    }
  }
}
