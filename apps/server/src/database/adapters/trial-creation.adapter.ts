import { Inject, Injectable } from '@nestjs/common';
import { TrialCreationRepository, type Transaction } from '@lytronix/db';
import type { TrialCreationStore } from '../../modules/identity/ports/trial-creation-store';

/** Trial-creation history (AUTH-09), tx-joined -- every call runs inside the caller's own transaction. */
@Injectable()
export class DrizzleTrialCreationStore implements TrialCreationStore {
  constructor(
    @Inject(TrialCreationRepository) private readonly creations: TrialCreationRepository,
  ) {}

  countByIdentitySince(tx: Transaction, identityId: string, since: Date): Promise<number> {
    return this.creations.countByIdentitySince(tx, identityId, since);
  }

  countByIpSince(tx: Transaction, ip: string, since: Date): Promise<number> {
    return this.creations.countByIpSince(tx, ip, since);
  }

  record(tx: Transaction, identityId: string, ip: string | null): Promise<void> {
    return this.creations.insert(tx, { identityId, ip });
  }
}
