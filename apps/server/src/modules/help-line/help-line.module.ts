import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { HelpLine } from './services/help-line';

// D8-4 (Phase 8 Slice 8.7): Lytro's help line, read from the platform settings. A leaf, so the team's public route and Lytro's
// payment page can each import it.
@Module({
  imports: [PlatformSettingsModule],
  providers: [HelpLine],
  exports: [HelpLine],
})
export class HelpLineModule {}
