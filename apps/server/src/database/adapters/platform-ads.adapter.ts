import { Inject, Injectable } from '@nestjs/common';
import {
  PlatformAdEventRepository,
  TransactionRunner,
  UserRepository,
  type Transaction,
} from '@lytronix/db';
import type { PlatformAdStore } from '../../modules/platform-ads/ports/platform-ad-store';
import type { PlatformAdEvent } from '../../modules/platform-ads/types/platform-ad';
import { DatabaseService } from '../database.service';

/** MKT-04: Lytro's own once-per-shop ad events, and the owner's phone they are told of by. */
@Injectable()
export class DrizzlePlatformAdStore implements PlatformAdStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlatformAdEventRepository) private readonly events: PlatformAdEventRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  claim(tx: Transaction, tenantId: string, event: PlatformAdEvent): Promise<boolean> {
    return this.events.claim(tx, tenantId, event);
  }

  async ownerPhoneOf(tenantId: string): Promise<string | null> {
    const owner = await this.transactions.run(this.database.handle.db, (tx) =>
      this.users.findOwnerContact(tx, tenantId),
    );
    return owner?.phone ?? null;
  }
}
