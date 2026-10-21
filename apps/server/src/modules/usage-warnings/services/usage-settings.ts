import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingKey } from '@lytronix/validators';
import {
  DEFAULT_FAST_SPEND_PERCENT,
  DEFAULT_USAGE_GRACE_PERCENT,
} from '../../../common/usage-warnings';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/** BND-03, RTE-03, RTE-12: the operator's figures for the grace past a limit and for a fast hour of API requests. */
@Injectable()
export class UsageSettings {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /** How far past its bandwidth or API requests a shop is still served, as a percent of the limit. */
  gracePercent(): Promise<number> {
    return this.percent(PlatformSettingKey.UsageGracePercent, DEFAULT_USAGE_GRACE_PERCENT);
  }

  /** The share of a cycle's API requests that, spent in one hour, alerts the owner and the operator. */
  fastSpendPercent(): Promise<number> {
    return this.percent(PlatformSettingKey.FastSpendPercent, DEFAULT_FAST_SPEND_PERCENT);
  }

  private async percent(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : fallback;
  }
}
