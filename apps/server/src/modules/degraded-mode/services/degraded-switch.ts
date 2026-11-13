import { Inject, Injectable } from '@nestjs/common';
import {
  DEGRADED_NOTICE,
  NoticeAudienceKind,
  NoticeCategory,
  NoticeSeverity,
  PlatformSettingKey,
  type DegradedModeValue,
} from '@lytronix/validators';
import { NoticeDesk, type NoticeOperator } from '../../notices/services/notice-desk';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { DegradedMode, type DegradedState } from './degraded-mode';

/**
 * DAT-38, D9-14 (Phase 9 Slice 9.5): the operator's switch. On, it takes effect first, then puts the owner's notice up
 * for every shop, pinned; off, it takes the notice down first, then goes off -- so a change that stops halfway is
 * finished by flipping it again, and never leaves a notice up with the mode off. Each step is in the platform audit log
 * (the setting's change, the notice's).
 */
@Injectable()
export class DegradedSwitch {
  constructor(
    @Inject(DegradedMode) private readonly degraded: DegradedMode,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(NoticeDesk) private readonly notices: NoticeDesk,
  ) {}

  /** As it stands now, read fresh. */
  state(): Promise<DegradedState> {
    this.degraded.forget();
    return this.degraded.state();
  }

  async turn(on: boolean, operator: NoticeOperator): Promise<DegradedState> {
    const now = await this.state();
    if (on) {
      if (!now.on) await this.store({ on: true, noticeId: null }, operator);
      if (now.noticeId === null) {
        const notice = await this.notices.create(
          {
            ...DEGRADED_NOTICE,
            category: NoticeCategory.Maintenance,
            severity: NoticeSeverity.Important,
            audience: { kind: NoticeAudienceKind.All },
            publishAt: new Date(),
            pinned: true,
          },
          operator,
        );
        await this.store({ on: true, noticeId: notice.id }, operator);
      }
    } else if (now.on || now.noticeId !== null) {
      if (now.noticeId !== null) await this.notices.withdraw(now.noticeId, operator);
      await this.store({ on: false, noticeId: null }, operator);
    }
    return this.state();
  }

  private async store(value: DegradedModeValue, operator: NoticeOperator): Promise<void> {
    await this.settings.set(PlatformSettingKey.DegradedMode, value, operator.operatorId);
    this.degraded.forget();
  }
}
