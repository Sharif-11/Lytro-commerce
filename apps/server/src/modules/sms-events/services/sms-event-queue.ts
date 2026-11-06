import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName, type SmsEvent } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';

/** SMS-01: what happened to an order, queued where it happened, for the SMS events it may send. */
export interface SmsEventJob {
  tenantId: string;
  orderId: string;
  events: SmsEvent[];
  /** A payment's own amount, for the payment events; an order's events say its total. */
  amount?: string;
  /** What makes the job once: a payment's ID, so a second payment on the same order gets its own SMS. */
  ref?: string;
}

/**
 * The job's own key, as the outbox keeps one: a UUID (RFC 4122's name-based form) drawn from the order, its events and
 * the ref, so the same event queued twice is one job and two payments on one order are two.
 */
export function smsEventKey(job: SmsEventJob): string {
  const hex = createHash('sha1')
    .update([job.orderId, ...job.events, job.ref ?? ''].join(':'))
    .digest('hex');
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * SMS-01, PHASE-7-PLAN §3.4 (Slice 7.2): the one way an order's event reaches its SMS. Called in the transaction where
 * the order changed, at the single place it changes, so the job commits with that change or not at all; everything
 * else (the shop's switches, the words, the charge, the send) happens apart from it, and never holds it up.
 */
@Injectable()
export class SmsEventQueue {
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  async queue(tx: Transaction, job: SmsEventJob): Promise<void> {
    await this.jobs.enqueue(tx, QueueName.OrderSms, job, { singletonKey: smsEventKey(job) });
  }
}
