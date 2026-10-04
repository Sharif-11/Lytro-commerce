import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { SignupModule } from './signup/signup.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, TenancyModule, SignupModule],
  controllers: [HealthController],
})
export class AppModule {}
