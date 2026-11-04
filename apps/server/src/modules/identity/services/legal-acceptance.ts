import { Inject, Injectable } from '@nestjs/common';
import type { AcceptedTerms } from '@lytronix/db';
import { PlatformSettingKey } from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/**
 * LEG-01: what continuing from the entry screen accepts: the terms and privacy versions in force at that moment, read from the
 * platform settings, so publishing new text needs no deploy. A sign-up without them must fail rather than record nothing,
 * since a missing record can't be recovered later.
 */
@Injectable()
export class LegalAcceptance {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async now(): Promise<AcceptedTerms> {
    const [terms, privacy] = await Promise.all([
      this.settings.current(PlatformSettingKey.TermsVersion),
      this.settings.current(PlatformSettingKey.PrivacyVersion),
    ]);
    if (typeof terms?.value !== 'string' || typeof privacy?.value !== 'string') {
      throw new Error('the terms and privacy versions are not set');
    }
    return {
      termsVersion: terms.value,
      privacyVersion: privacy.value,
      termsAcceptedAt: new Date(),
    };
  }
}
