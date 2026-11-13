import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PausedWhileDegradedInterceptor } from './paused-while-degraded';
import { DegradedMode } from './services/degraded-mode';

/**
 * DAT-38, D9-14 (Phase 9 Slice 9.5): degraded mode's effects, for every module -- the rate limits it divides, the
 * routes it refuses and the queues it holds back. The operator's switch is the team module's (it posts a notice).
 */
@Global()
@Module({
  imports: [PlatformSettingsModule],
  providers: [DegradedMode, { provide: APP_INTERCEPTOR, useClass: PausedWhileDegradedInterceptor }],
  exports: [DegradedMode],
})
export class DegradedModeModule {}
