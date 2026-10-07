import type { Transaction } from '@lytronix/db';

/** The platform account behind a staff phone (AUTH-08, STF-06). */
export interface StaffAccounts {
  /**
   * Returns the subscriber for a staff phone. An existing account is reused; a new phone gets a new account with the
   * phone as a pending identity, verified by the person's first code sign-in. Returns null when the phone belongs to a
   * shop owner, who cannot also be staff (STF-06).
   */
  reservePhone(tx: Transaction, phone: string): Promise<string | null>;
}
