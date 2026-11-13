import { Module } from '@nestjs/common';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleMediaCostStore } from '../../database/adapters/media-costs.adapter';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { MailModule } from '../shared/mail/mail.module';
import { OutsideCalls } from '../shared/outside-calls/services/outside-calls';
import type { R2Usage } from './ports/r2-usage';
import { CloudflareR2Usage } from './providers/cloudflare-r2-usage';
import { UnconfiguredR2Usage } from './providers/unconfigured-r2-usage';
import { MediaCostSettings } from './services/media-cost-settings';
import { MediaCosts } from './services/media-costs';
import { MEDIA_COST_STORE, MEDIA_COSTS_CLOCK, R2_USAGE } from './tokens';

/** D8-57: Cloudflare's analytics when its token is set (its account is then required, env.ts); else nothing to read. */
function r2Usage(env: Env, outside: OutsideCalls): R2Usage {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) return new UnconfiguredR2Usage();
  return new CloudflareR2Usage({ apiToken, accountId }, undefined, outside.breaker('cloudflare'));
}

// MED-12, D8-17, D8-57 to D8-64 (Phase 8 Slice 8.6): what Cloudflare will bill for Lytro's media, held against the
// operator's budget, with its alert.
@Module({
  imports: [PlatformSettingsModule, MailModule],
  providers: [
    MediaCostSettings,
    MediaCosts,
    { provide: R2_USAGE, inject: [ENV, OutsideCalls], useFactory: r2Usage },
    { provide: MEDIA_COST_STORE, useClass: DrizzleMediaCostStore },
    { provide: MEDIA_COSTS_CLOCK, useValue: () => new Date() },
  ],
  exports: [MediaCosts],
})
export class MediaCostsModule {}
