import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlatformSettingKey } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { NotificationStore } from '../ports/notification-store';
import { NOTIFICATION_STORE } from '../tokens';

/** D7-39: the days a notification is kept when the setting can't be read. */
export const NOTIFICATION_RETENTION_DAYS_DEFAULT = 30;

/**
 * NTF-01, D7-39 (the owner's pick, 2026-11-07): each night, every shop's notifications older than the setting's days (30)
 * are deleted, shop by shop, one failing never stopping the rest. Safe to run twice. How many went.
 */
@Injectable()
export class NotificationPurge {
  private readonly logger = new Logger('NotificationPurge');

  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async run(now: Date): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.NotificationRetentionDays);
    const days =
      typeof setting?.value === 'number' && setting.value > 0
        ? setting.value
        : NOTIFICATION_RETENTION_DAYS_DEFAULT;
    const before = new Date(now.getTime() - days * DAY_MS);
    let removed = 0;
    for (const tenantId of await this.store.listShopIds()) {
      try {
        removed += await this.store.run(tenantId, (tx) =>
          this.store.purgeBefore(tx, tenantId, before),
        );
      } catch (error) {
        this.logger.error(`notification clean-up failed for tenant ${tenantId}`, error as Error);
      }
    }
    return removed;
  }
}
