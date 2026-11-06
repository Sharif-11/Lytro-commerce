import { Inject, Injectable } from '@nestjs/common';
import { SmsLogRepository, TransactionRunner } from '@lytronix/db';
import type { SmsLogEntry, SmsLogStore } from '../../modules/sms-usage/ports/sms-log-store';
import { DatabaseService } from '../database.service';

/** tenant.sms_log (SMS-07, SMS-17). */
@Injectable()
export class DrizzleSmsLogStore implements SmsLogStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(SmsLogRepository) private readonly log: SmsLogRepository,
  ) {}

  async record(entry: SmsLogEntry): Promise<void> {
    await this.transactions.run(this.database.handle.db, (tx) => this.log.insert(tx, entry));
  }
}
