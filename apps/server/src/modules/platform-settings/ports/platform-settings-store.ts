import type { PlatformSettingKey } from '@lytronix/validators';
import type { PlatformSettingValue } from '../types/platform-setting';

/** control.platform_settings. Platform-wide, no transaction or tenant context needed. */
export interface PlatformSettingsStore {
  get(key: PlatformSettingKey): Promise<PlatformSettingValue | null>;
  list(): Promise<PlatformSettingValue[]>;
  set(
    key: PlatformSettingKey,
    value: unknown,
    description: string,
    updatedBy: string,
  ): Promise<void>;
}
