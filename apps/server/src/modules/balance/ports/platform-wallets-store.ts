import type { PlatformWallet } from '../types/platform-wallet';

export interface NewPlatformWalletValues {
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
}

export type UpdatePlatformWalletValues = Partial<NewPlatformWalletValues>;

/** control.platform_wallets (BIL-02/BAL-03). Platform-wide, no transaction or tenant context needed. */
export interface PlatformWalletsStore {
  list(enabledOnly: boolean): Promise<PlatformWallet[]>;
  create(values: NewPlatformWalletValues): Promise<PlatformWallet>;
  update(id: string, values: UpdatePlatformWalletValues): Promise<PlatformWallet | null>;
  remove(id: string): Promise<void>;
}
