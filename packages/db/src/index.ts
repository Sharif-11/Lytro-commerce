// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { createDatabase, type Database, type DatabaseHandle } from './client';
export { runMigrations } from './migrate';
export {
  isUniqueViolation,
  runInTransaction,
  setTenantContext,
  type Executor,
  type Transaction,
} from './transactions';
export {
  findTenantByActiveDomain,
  findTenantBySlug,
  type TenantLookupRow,
} from './repositories/tenancy/tenant-lookup';
export { findUnavailableSlugs } from './repositories/tenancy/slug-availability';
export { findPlanByName, insertTenant } from './repositories/tenancy/tenants';
export {
  countChallengesSince,
  consumeChallenge,
  insertChallenge,
  latestChallenge,
  lockChallenge,
  recordWrongAttempt,
  type ChallengeRow,
} from './repositories/identity/challenges';
export {
  findPhoneIdentity,
  insertPhoneIdentity,
  insertSubscriber,
} from './repositories/identity/accounts';
export { insertOwnerUser } from './repositories/staff/users';
export { insertSmsMessage } from './repositories/messaging/sms';
