import { Module } from '@nestjs/common';
import { ENV } from '../../config/tokens';
import type { Env } from '../../config/env';
import { DrizzlePlatformAdStore } from '../../database/adapters/platform-ads.adapter';
import { QueueModule } from '../shared/queue/queue.module';
import { AdVisitReader } from './services/ad-visit-reader';
import { PlatformAdEvents } from './services/platform-ad-events';
import { PlatformAdSettings } from './services/platform-ad-settings';
import { PLATFORM_AD_SETTINGS, PLATFORM_AD_STORE } from './tokens';

// MKT-02 to MKT-05: the queue side of Lytro's own ad events alone, so sign-up, orders and billing can queue one without
// reaching Meta's client.
@Module({
  imports: [QueueModule],
  providers: [
    {
      provide: PLATFORM_AD_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env) => new PlatformAdSettings(env),
    },
    { provide: PLATFORM_AD_STORE, useClass: DrizzlePlatformAdStore },
    PlatformAdEvents,
    AdVisitReader,
  ],
  exports: [PlatformAdEvents, AdVisitReader, PLATFORM_AD_SETTINGS, PLATFORM_AD_STORE],
})
export class PlatformAdEventsModule {}
