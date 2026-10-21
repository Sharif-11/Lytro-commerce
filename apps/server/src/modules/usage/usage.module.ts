import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { MediaModule } from '../media/media.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { SmsUsageModule } from '../sms-usage/sms-usage.module';
import { StaffModule } from '../staff/staff.module';
import { UsageService } from './services/usage.service';

// LIM-02, D3: the shop's usage against its limits, gathered from the modules that count each metric. Nothing imports
// this module back, so each of them stays free to be read here.
@Module({
  imports: [CatalogueModule, StaffModule, MediaModule, PublicApiModule, SmsUsageModule],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
