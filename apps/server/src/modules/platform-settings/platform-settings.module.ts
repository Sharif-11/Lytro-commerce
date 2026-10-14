import { Module } from '@nestjs/common';
import { DrizzlePlatformSettingsStore } from '../../database/adapters/platform-settings.adapter';
import { AuditModule } from '../audit/audit.module';
import { PlatformSettingsService } from './services/platform-settings.service';
import { PLATFORM_SETTINGS_STORE } from './tokens';

// D2-8/LIF-26: platform-wide settings (trial length today; slice 7 adds the grace/read-only/locked stage
// lengths to the same key list). A leaf-ish module -- only depends on AuditModule, so tenancy can import it
// without a cycle, and operator-facing read/write lives in the team module's own controller.
@Module({
  imports: [AuditModule],
  providers: [
    { provide: PLATFORM_SETTINGS_STORE, useClass: DrizzlePlatformSettingsStore },
    PlatformSettingsService,
  ],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
