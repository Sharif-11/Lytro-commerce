import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { FairUseSwitch } from './services/fair-use-switch';

// PAYG-FAIR-USE-PLAN: the operator's switch and its figures. A leaf module -- only the settings -- so orders, billing,
// balance and the public API can each read it without a cycle.
@Module({
  imports: [PlatformSettingsModule],
  providers: [FairUseSwitch],
  exports: [FairUseSwitch],
})
export class FairUseModule {}
