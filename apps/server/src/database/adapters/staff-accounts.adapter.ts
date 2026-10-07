import { Inject, Injectable } from '@nestjs/common';
import { AccountRepository, type Transaction } from '@lytronix/db';
import { IdentityKind } from '@lytronix/validators';
import type { StaffAccounts } from '../../modules/staff/ports/staff-accounts';

/** Platform accounts for staff phones, written inside the caller's transaction. */
@Injectable()
export class DrizzleStaffAccounts implements StaffAccounts {
  constructor(@Inject(AccountRepository) private readonly accounts: AccountRepository) {}

  async reservePhone(tx: Transaction, phone: string): Promise<string | null> {
    const existing = await this.accounts.findSubscriberByIdentity(tx, IdentityKind.Phone, phone);
    if (existing) {
      const owned = await this.accounts.findOwnedTenant(tx, existing.subscriberId);
      return owned ? null : existing.subscriberId;
    }
    const subscriberId = await this.accounts.insertSubscriber(tx);
    await this.accounts.insertIdentity(tx, {
      subscriberId,
      kind: IdentityKind.Phone,
      value: phone,
      verifiedAt: null,
    });
    return subscriberId;
  }
}
