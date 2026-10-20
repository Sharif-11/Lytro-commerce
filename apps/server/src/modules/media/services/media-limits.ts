import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { MediaKind, PlatformSettingKey, withOverrides } from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { MediaStore } from '../ports/media-store';
import { MEDIA_STORE } from '../tokens';

export const MB = 1024 * 1024;

// STO-04, STO-05: the largest file of each kind, unless the operator has set another (2.1, "editable").
const DEFAULT_MAX_MB: Readonly<Record<MediaKind, number>> = {
  [MediaKind.Image]: 5,
  [MediaKind.Video]: 100,
};
const MAX_MB_SETTING: Readonly<Record<MediaKind, PlatformSettingKey>> = {
  [MediaKind.Image]: PlatformSettingKey.MediaImageMaxMb,
  [MediaKind.Video]: PlatformSettingKey.MediaVideoMaxMb,
};

/**
 * STO-02 to STO-05, PLN-11, PLN-19: what one upload may be, and how much the shop may store. One place, so starting an
 * upload and processing it judge by the same limits.
 */
@Injectable()
export class MediaLimits {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
  ) {}

  /** The largest file of this kind, in MB. */
  async maxMb(kind: MediaKind): Promise<number> {
    const setting = await this.settings.current(MAX_MB_SETTING[kind]);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_MAX_MB[kind];
  }

  /**
   * The shop's storage limit in MB, overrides laid over its plan; null is unlimited (PLN-19), and so is a plan that
   * sets none -- the same reading the product limit has.
   */
  async storageMb(tx: Transaction, tenantId: string): Promise<number | null> {
    const { snapshot, overrides } = await this.store.planLimits(tx, tenantId);
    return withOverrides(snapshot, overrides)?.storage_mb ?? null;
  }
}
