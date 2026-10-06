import { Global, Module } from '@nestjs/common';
import {
  AccountRepository,
  ChallengeRepository,
  SlugRepository,
  SessionRepository,
  SignInFailureRepository,
  SmsRepository,
  TenantRepository,
  TransactionRunner,
  UserRepository,
} from '@lytronix/db';
import { EnvironmentParser } from '../config/env';
import { ENV } from '../config/tokens';
import { DatabaseService } from './database.service';

// Repositories and the transaction runner are providers, with their class as the token. Adapters receive them
// through their constructors, so each dependency is declared where it is used and can be replaced in a test.
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => new EnvironmentParser().parse() },
    DatabaseService,
    { provide: TransactionRunner, useFactory: () => new TransactionRunner() },
    { provide: AccountRepository, useFactory: () => new AccountRepository() },
    { provide: ChallengeRepository, useFactory: () => new ChallengeRepository() },
    { provide: SessionRepository, useFactory: () => new SessionRepository() },
    { provide: SignInFailureRepository, useFactory: () => new SignInFailureRepository() },
    { provide: SlugRepository, useFactory: () => new SlugRepository() },
    { provide: SmsRepository, useFactory: () => new SmsRepository() },
    { provide: TenantRepository, useFactory: () => new TenantRepository() },
    {
      provide: UserRepository,
      inject: [TransactionRunner],
      useFactory: (transactions: TransactionRunner) => new UserRepository(transactions),
    },
  ],
  exports: [
    ENV,
    DatabaseService,
    TransactionRunner,
    AccountRepository,
    ChallengeRepository,
    SessionRepository,
    SignInFailureRepository,
    SlugRepository,
    SmsRepository,
    TenantRepository,
    UserRepository,
  ],
})
export class DatabaseModule {}
