import { Module } from '@nestjs/common';
import { DrizzleUsageWarningStore } from '../../database/adapters/usage-warnings.adapter';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { QueueModule } from '../shared/queue/queue.module';
import { QueuedPackAutoBuys } from './services/queued-pack-auto-buys';
import { QueuedUsageNotices } from './services/queued-usage-notices';
import { UsageSettings } from './services/usage-settings';
import { UsageWarnings } from './services/usage-warnings';
import { PACK_AUTO_BUYS, USAGE_CLOCK, USAGE_NOTICES, USAGE_WARNING_STORE } from './tokens';

// LIM-01, SCL-08: deciding and queueing usage warnings. It sits below every module that counts a use of a limit --
// catalogue, staff, media, the public API, the essential-SMS count -- and imports none of them, so each can call it;
// the usage module's worker writes and sends what it queues. BND-04, RTE-11: the packs auto-buy is to buy are queued
// here too, by the media and API counts, and bought by billing's pack worker.
@Module({
  imports: [QueueModule, PlatformSettingsModule],
  providers: [
    { provide: USAGE_WARNING_STORE, useClass: DrizzleUsageWarningStore },
    { provide: USAGE_NOTICES, useClass: QueuedUsageNotices },
    { provide: PACK_AUTO_BUYS, useClass: QueuedPackAutoBuys },
    { provide: USAGE_CLOCK, useValue: (): Date => new Date() },
    UsageWarnings,
    UsageSettings,
  ],
  exports: [UsageWarnings, UsageSettings, USAGE_NOTICES, PACK_AUTO_BUYS],
})
export class UsageWarningsModule {}
