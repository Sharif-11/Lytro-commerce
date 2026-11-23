import { Inject, Injectable } from '@nestjs/common';
import { PaygFairUseMode, PlatformSettingKey } from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/** PF-13: the activation top-up when the operator hasn't set one, in TK. */
export const DEFAULT_ACTIVATION_TOP_UP = 10;
/** PF-14: the free successful requests a cycle when the operator hasn't set them. */
export const DEFAULT_FREE_REQUESTS = 10_000;

/**
 * PYG-30 (PAYG-FAIR-USE-PLAN section 6): the operator's switch for pay-as-you-go fair use, and its two figures. With the
 * switch off, pay-as-you-go works exactly as it did before fair use: no order locks, no storefront pauses and the API
 * keeps its plan's limit. Read through the settings cache, so a change reaches every server within seconds.
 */
@Injectable()
export class FairUseSwitch {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async isOn(): Promise<boolean> {
    return (
      (await this.settings.current(PlatformSettingKey.PaygFairUse))?.value === PaygFairUseMode.On
    );
  }

  /** PF-13: the one top-up, in TK, that opens a pay-as-you-go storefront. */
  async activationTopUp(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.PaygActivationTopUp);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_ACTIVATION_TOP_UP;
  }

  /** PF-14: the successful requests a pay-as-you-go shop's own website makes free each cycle. */
  async freeRequests(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.PaygApiFreeRequests);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_FREE_REQUESTS;
  }
}
