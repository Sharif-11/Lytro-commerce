import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingsRepository } from '@lytronix/db';
import type { PlatformSettingKey } from '@lytronix/validators';
import type { PlatformSettingsStore } from '../../modules/platform-settings/ports/platform-settings-store';
import type { PlatformSettingValue } from '../../modules/platform-settings/types/platform-setting';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePlatformSettingsStore implements PlatformSettingsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(PlatformSettingsRepository) private readonly settings: PlatformSettingsRepository,
  ) {}

  async get(key: PlatformSettingKey): Promise<PlatformSettingValue | null> {
    const row = await this.settings.get(this.database.handle.db, key);
    return row
      ? {
          key: row.key,
          value: row.value,
          description: row.description,
          updatedBy: row.updatedBy,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  async list(): Promise<PlatformSettingValue[]> {
    const rows = await this.settings.list(this.database.handle.db);
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      description: row.description,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    }));
  }

  set(
    key: PlatformSettingKey,
    value: unknown,
    description: string,
    updatedBy: string,
  ): Promise<void> {
    return this.settings.set(this.database.handle.db, key, value, description, updatedBy);
  }
}
