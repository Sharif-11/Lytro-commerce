import { Module } from '@nestjs/common';
import { MetaConversionsModule } from '../shared/meta-conversions/meta-conversions.module';
import { PlatformAdEventsModule } from './platform-ad-events.module';
import { PlatformAdSender } from './services/platform-ad-sender';

// MKT-02: the sending side, for the queue's worker: Lytro's events to its own pixel through Meta's client.
@Module({
  imports: [PlatformAdEventsModule, MetaConversionsModule],
  providers: [PlatformAdSender],
  exports: [PlatformAdSender],
})
export class PlatformAdsModule {}
