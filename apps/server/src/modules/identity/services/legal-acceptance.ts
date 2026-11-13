import { Inject, Injectable } from '@nestjs/common';
import type { AcceptedTerms } from '@lytronix/db';
import { LegalVersions } from '../../legal/services/legal-versions';

/**
 * LEG-01: what continuing from the entry screen accepts: the terms and privacy versions in force at that moment, read from the
 * platform settings, so publishing new text needs no deploy. A sign-up without them must fail rather than record nothing,
 * since a missing record can't be recovered later. Slice 9.8: the versions come from the one reader the website's
 * `GET /legal-versions` uses, so the text a page shows is the version sign-up records.
 */
@Injectable()
export class LegalAcceptance {
  constructor(@Inject(LegalVersions) private readonly versions: LegalVersions) {}

  async now(): Promise<AcceptedTerms> {
    const { termsVersion, privacyVersion } = await this.versions.current();
    return { termsVersion, privacyVersion, termsAcceptedAt: new Date() };
  }
}
