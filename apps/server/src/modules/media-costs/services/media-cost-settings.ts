import { Inject, Injectable } from '@nestjs/common';
import {
  cloudflarePricesSchema,
  DEFAULT_CLOUDFLARE_BILLING_DAY,
  DEFAULT_CLOUDFLARE_PRICES,
  DEFAULT_MEDIA_BUDGET_ALERT_PERCENT,
  DEFAULT_MEDIA_BUDGET_USD,
  PlatformSettingKey,
  type CloudflarePrices,
} from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/** MED-12, D8-58 to D8-61: the operator's figures for media costs, each its default until set (ADM-11). */
@Injectable()
export class MediaCostSettings {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /** The month's budget, in whole US dollars. */
  budgetUsd(): Promise<number> {
    return this.number(PlatformSettingKey.MediaBudgetUsd, DEFAULT_MEDIA_BUDGET_USD);
  }

  /** The percent of the budget that sends the alert. */
  alertPercent(): Promise<number> {
    return this.number(
      PlatformSettingKey.MediaBudgetAlertPercent,
      DEFAULT_MEDIA_BUDGET_ALERT_PERCENT,
    );
  }

  /** D8-61: the one address the alert goes to, or null until the operator sets it. */
  async alertEmail(): Promise<string | null> {
    const setting = await this.settings.current(PlatformSettingKey.MediaCostAlertEmail);
    return typeof setting?.value === 'string' && setting.value !== '' ? setting.value : null;
  }

  /** The day of the month Cloudflare's invoice period starts on. */
  billingDay(): Promise<number> {
    return this.number(PlatformSettingKey.CloudflareBillingDay, DEFAULT_CLOUDFLARE_BILLING_DAY);
  }

  /** D8-60: Cloudflare's prices, the defaults until the operator changes them. */
  async prices(): Promise<CloudflarePrices> {
    const setting = await this.settings.current(PlatformSettingKey.CloudflarePrices);
    const parsed = cloudflarePricesSchema.safeParse(setting?.value);
    return parsed.success ? parsed.data : DEFAULT_CLOUDFLARE_PRICES;
  }

  private async number(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : fallback;
  }
}
