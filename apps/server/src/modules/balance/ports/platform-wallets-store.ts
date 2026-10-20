import type { Transaction } from '@lytronix/db';
import type { PlatformWallet } from '../types/platform-wallet';

export interface NewPlatformWalletValues {
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
}

export type UpdatePlatformWalletValues = Partial<NewPlatformWalletValues>;

/** control.platform_wallets (BIL-02/BAL-03). Platform-wide, no tenant context needed. */
export interface PlatformWalletsStore {
  /**
   * ADM-08: a change and its platform audit entry in one transaction, so a committed change always has its entry
   * and a rolled-back one never does.
   */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(enabledOnly: boolean): Promise<PlatformWallet[]>;
  create(tx: Transaction, values: NewPlatformWalletValues): Promise<PlatformWallet>;
  update(
    tx: Transaction,
    id: string,
    values: UpdatePlatformWalletValues,
  ): Promise<PlatformWallet | null>;
  remove(tx: Transaction, id: string): Promise<void>;
}
