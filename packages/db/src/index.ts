// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { DatabaseConnector, type Database, type DatabaseHandle, type PoolSettings } from './client';
export { MigrationRunner } from './migrate';
export { TransactionRunner, type Executor, type Transaction } from './transactions';
export {
  TenantRepository,
  type TenantLookupRow,
  type TenantSummaryRow,
} from './repositories/tenancy/tenant.repository';
export { SlugRepository } from './repositories/tenancy/slug.repository';
export {
  ChallengeRepository,
  type ChallengeRow,
} from './repositories/identity/challenge.repository';
export { AccountRepository } from './repositories/identity/account.repository';
export { OauthStateRepository } from './repositories/identity/oauth-state.repository';
export {
  SignInFailureRepository,
  type FailureScope,
} from './repositories/identity/sign-in-failure.repository';
export {
  SessionRepository,
  type SessionRow,
  type NewSession,
} from './repositories/identity/session.repository';
export { ActivityLogRepository } from './repositories/audit/activity-log.repository';
export { RoleRepository } from './repositories/staff/role.repository';
export { UserRepository } from './repositories/staff/user.repository';
export {
  SmsRepository,
  type ClaimedSmsMessage,
  type NewSmsMessage,
} from './repositories/messaging/sms.repository';
