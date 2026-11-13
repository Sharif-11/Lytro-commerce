import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { LegalVersions } from './services/legal-versions';

// LEG-01 (Phase 9 Slice 9.8): the terms and privacy versions in force, read from the platform settings. A leaf, so sign-up
// (identity) and the website's public route (team) can each import it.
@Module({
  imports: [PlatformSettingsModule],
  providers: [LegalVersions],
  exports: [LegalVersions],
})
export class LegalModule {}
