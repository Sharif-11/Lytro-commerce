import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingKey, type LegalVersionsView } from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

export type { LegalVersionsView };

/**
 * LEG-01, LEG-02 (Phase 9 Slice 9.8): the terms of service and privacy policy versions in force, as the platform settings
 * name them -- the one place that reads them, so what sign-up records and what the website shows on /terms and /privacy
 * never disagree. A setting can only name a published version (the settings' own check).
 */
@Injectable()
export class LegalVersions {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /** Both versions; throws when either is unset, since a sign-up that records nothing can't be put right later. */
  async current(): Promise<LegalVersionsView> {
    const terms = await this.settings.current(PlatformSettingKey.TermsVersion);
    const privacy = await this.settings.current(PlatformSettingKey.PrivacyVersion);
    if (typeof terms?.value !== 'string' || typeof privacy?.value !== 'string') {
      throw new Error('the terms and privacy versions are not set');
    }
    return { termsVersion: terms.value, privacyVersion: privacy.value };
  }
}
