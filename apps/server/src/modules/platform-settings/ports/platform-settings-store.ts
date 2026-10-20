import type { Transaction } from '@lytronix/db';
import type { PlatformSettingKey } from '@lytronix/validators';
import type { PlatformSettingValue } from '../types/platform-setting';

/** control.platform_settings. Platform-wide, no tenant context needed. */
export interface PlatformSettingsStore {
  /**
   * ADM-08: a change and its platform audit entry in one transaction, so a committed change always has its entry
   * and a rolled-back one never does.
   */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  get(key: PlatformSettingKey): Promise<PlatformSettingValue | null>;
  list(): Promise<PlatformSettingValue[]>;
  set(
    tx: Transaction,
    key: PlatformSettingKey,
    value: unknown,
    description: string,
    updatedBy: string,
  ): Promise<void>;
}
