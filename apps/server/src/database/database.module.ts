import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { ENV } from '../config/tokens';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, DatabaseService],
  exports: [ENV, DatabaseService],
})
export class DatabaseModule {}
