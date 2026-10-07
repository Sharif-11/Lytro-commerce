import { Global, Module } from '@nestjs/common';
import {
  AccountRepository,
  ChallengeRepository,
  SlugRepository,
  SessionRepository,
  OauthStateRepository,
  SignInFailureRepository,
  SmsRepository,
  MailRepository,
  TenantRepository,
  TransactionRunner,
  ActivityLogRepository,
  JobOutboxRepository,
  RoleRepository,
  UserRepository,
} from '@lytronix/db';
import { EnvironmentParser } from '../config/env';
import { ENV } from '../config/tokens';
import { DatabaseService } from './database.service';

// Repositories and the transaction runner are providers, with their class as the token.
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
    { provide: OauthStateRepository, useFactory: () => new OauthStateRepository() },
    { provide: SlugRepository, useFactory: () => new SlugRepository() },
    { provide: SmsRepository, useFactory: () => new SmsRepository() },
    { provide: MailRepository, useFactory: () => new MailRepository() },
    { provide: TenantRepository, useFactory: () => new TenantRepository() },
    {
      provide: JobOutboxRepository,
      useFactory: () => new JobOutboxRepository(),
    },
    {
      provide: ActivityLogRepository,
      inject: [TransactionRunner],
      useFactory: (transactions: TransactionRunner) => new ActivityLogRepository(transactions),
    },
    {
      provide: RoleRepository,
      inject: [TransactionRunner],
      useFactory: (transactions: TransactionRunner) => new RoleRepository(transactions),
    },
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
    ActivityLogRepository,
    JobOutboxRepository,
    RoleRepository,
    AccountRepository,
    ChallengeRepository,
    SessionRepository,
    SignInFailureRepository,
    OauthStateRepository,
    SlugRepository,
    SmsRepository,
    MailRepository,
    TenantRepository,
    UserRepository,
  ],
})
export class DatabaseModule {}
