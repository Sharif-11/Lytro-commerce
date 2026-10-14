// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { DatabaseConnector, type Database, type DatabaseHandle, type PoolSettings } from './client';
export { MigrationRunner } from './migrate';
export { ActivityLogPurger } from './purge-activity-log';
export { QueueBootstrapper } from './bootstrap-queue';
export { OperatorCreator } from './create-operator';
export { OperatorTwoFactorReset } from './reset-operator-2fa';
export { TransactionRunner, type Executor, type Transaction } from './transactions';
export {
  TenantRepository,
  type TenantLookupRow,
  type TenantSummaryRow,
  type BalanceRow,
  type BillingInfoRow,
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
export { SignupAttemptRepository } from './repositories/identity/signup-attempt.repository';
export {
  SessionRepository,
  type SessionRow,
  type NewSession,
} from './repositories/identity/session.repository';
export { ActivityLogRepository } from './repositories/audit/activity-log.repository';
export {
  JobOutboxRepository,
  type ClaimedOutboxRow,
} from './repositories/queue/job-outbox.repository';
export { RoleRepository } from './repositories/staff/role.repository';
export { UserRepository } from './repositories/staff/user.repository';
export {
  SmsRepository,
  type ClaimedSmsMessage,
  type NewSmsMessage,
} from './repositories/messaging/sms.repository';
export {
  MailRepository,
  type ClaimedMailMessage,
  type NewMailMessage,
} from './repositories/messaging/mail.repository';
export {
  OperatorAccountRepository,
  type OperatorAccountRow,
  type NewOperatorAccount,
} from './repositories/operator/operator-account.repository';
export {
  OperatorBackupCodeRepository,
  type OperatorBackupCodeRow,
} from './repositories/operator/operator-backup-code.repository';
export {
  OperatorSessionRepository,
  type OperatorSessionRow,
  type NewOperatorSession,
} from './repositories/operator/operator-session.repository';
export {
  PlatformAuditLogRepository,
  type NewPlatformAuditEntry,
} from './repositories/platform/platform-audit-log.repository';
export { PlatformSettingsRepository } from './repositories/platform/platform-settings.repository';
export {
  BalanceLedgerRepository,
  type LedgerFilters,
  type LedgerCursor,
} from './repositories/balance/balance-ledger.repository';
export { RatesRepository } from './repositories/balance/rates.repository';
export { ShopSettingsRepository } from './repositories/balance/shop-settings.repository';
export {
  PlansRepository,
  type NewPlan,
  type PlanEdit,
} from './repositories/billing/plans.repository';
export {
  BillingTermsRepository,
  PlanPricesRepository,
  type NewBillingTerm,
  type BillingTermEdit,
} from './repositories/billing/billing-terms.repository';
export { PlanAssignmentsRepository } from './repositories/billing/plan-assignments.repository';
export { PlanLimitOverridesRepository } from './repositories/billing/plan-limit-overrides.repository';
export {
  InvoiceCountersRepository,
  InvoicesRepository,
  type NewInvoice,
} from './repositories/billing/invoices.repository';
export {
  PlanPaymentsRepository,
  UsedTransactionIdsRepository,
  type NewPlanPayment,
} from './repositories/billing/plan-payments.repository';
export { IdempotencyKeysRepository } from './repositories/platform/idempotency-keys.repository';
