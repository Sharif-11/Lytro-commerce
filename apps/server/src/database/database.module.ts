import { Global, Module } from '@nestjs/common';
import { EnvironmentParser } from '../config/env';
import { ENV } from '../config/tokens';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => new EnvironmentParser().parse() }, DatabaseService],
  exports: [ENV, DatabaseService],
})
export class DatabaseModule {}
