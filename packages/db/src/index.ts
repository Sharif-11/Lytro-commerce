// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { createDatabase, type Database, type DatabaseHandle } from './client';
export { runMigrations } from './migrate';
export { TransactionRunner, type Executor, type Transaction } from './transactions';
export { TenantRepository, type TenantLookupRow } from './repositories/tenancy/tenant.repository';
export { SlugRepository } from './repositories/tenancy/slug.repository';
export {
  ChallengeRepository,
  type ChallengeRow,
} from './repositories/identity/challenge.repository';
export { AccountRepository } from './repositories/identity/account.repository';
export { UserRepository } from './repositories/staff/user.repository';
export {
  SmsRepository,
  type ClaimedSmsMessage,
  type NewSmsMessage,
} from './repositories/messaging/sms.repository';
