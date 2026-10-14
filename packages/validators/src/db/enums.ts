// Shared enumerations for the platform (ENGINEERING-STANDARDS §4). The database schema builds its Postgres enums from
// these, and the server and any frontend read the same values. Keep this file free of runtime dependencies.

export enum TenantState {
  Trial = 'trial',
  PayAsYouGo = 'pay_as_you_go',
  Active = 'active',
  Grace = 'grace',
  ReadOnly = 'read_only',
  Locked = 'locked',
  Archived = 'archived',
  Deleted = 'deleted',
}

export enum KycStatus {
  Unverified = 'unverified',
  Pending = 'pending',
  Verified = 'verified',
  Revoked = 'revoked',
}

export enum DomainStatus {
  Pending = 'pending',
  Active = 'active',
  Failed = 'failed',
  Removed = 'removed',
}

export enum IdentityKind {
  Phone = 'phone',
  Email = 'email',
  Google = 'google',
  Facebook = 'facebook',
}

export enum SignInMethod {
  Code = 'code',
  Password = 'password',
  Reset = 'reset',
  Oauth = 'oauth',
}

export enum OauthProvider {
  Google = 'google',
  Facebook = 'facebook',
}

export enum ChallengeChannel {
  Sms = 'sms',
  Email = 'email',
}

export enum ChallengeKind {
  Signin = 'signin',
  Reset = 'reset',
}

export enum SmsKind {
  Otp = 'otp',
  ShopReady = 'shop_ready',
}

export enum SmsStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
}

// D28: mail's own outbox, mirroring SMS's (SMS-18, D6) exactly.
export enum MailKind {
  Otp = 'otp',
  ShopReady = 'shop_ready',
}

export enum MailStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
}

// The permission names a role can hold. Dashboard users and API key scopes use the same names (TEN-5, API-06).
// Add a name here before any route checks it; the docs list the areas each one guards.
export enum Permission {
  AuditRead = 'audit:read',
  BalanceRead = 'balance:read',
  BalanceManage = 'balance:manage',
  ChatRead = 'chat:read',
  ChatReply = 'chat:reply',
  ChatManage = 'chat:manage',
  CouriersManage = 'couriers:manage',
  CustomersRead = 'customers:read',
  CustomersManage = 'customers:manage',
  FraudRead = 'fraud:read',
  FraudManage = 'fraud:manage',
  KeysManage = 'keys:manage',
  ListenerRead = 'listener:read',
  ListenerManage = 'listener:manage',
  NoticesRead = 'notices:read',
  OrdersRead = 'orders:read',
  OrdersManage = 'orders:manage',
  OrdersDelete = 'orders:delete',
  PaymentsRead = 'payments:read',
  PaymentsManage = 'payments:manage',
  PaymentsVerify = 'payments:verify',
  ProductsRead = 'products:read',
  ProductsManage = 'products:manage',
  SettingsManage = 'settings:manage',
  SmsRead = 'sms:read',
  SmsManage = 'sms:manage',
  StaffRead = 'staff:read',
  StaffManage = 'staff:manage',
  WalletsRead = 'wallets:read',
  WalletsManage = 'wallets:manage',
  WebhooksRead = 'webhooks:read',
  WebhooksManage = 'webhooks:manage',
}

// The actions the activity log records (AUD-01). Add a name here before any code writes it; the action codes are
// never translated. Each slice that adds an audited action extends this list, never a second one.
export enum AuditAction {
  SignIn = 'sign_in',
  SignInFailed = 'sign_in_failed',
  SignOut = 'sign_out',
  PasswordChanged = 'password_changed',
  PasswordReset = 'password_reset',
  StaffCreated = 'staff_created',
  StaffUpdated = 'staff_updated',
  StaffDeactivated = 'staff_deactivated',
  StaffReactivated = 'staff_reactivated',
  RoleCreated = 'role_created',
  RoleUpdated = 'role_updated',
  RoleDeleted = 'role_deleted',
  // PLN-17: an operator's not-for-sale plan assignment is operator-caused but changes the tenant's own plan, so
  // it writes both this log (D2-5) and PlatformAuditAction.PlanAssigned below.
  PlanAssigned = 'plan_assigned',
  // TRL-07: a system-caused lifecycle transition (the trial-end job, later the grace/read-only/locked
  // cascade too) -- D2-5 puts these on the tenant's own log only, so the owner sees why, with no platform
  // audit mirror (an operator can already see tenant state directly).
  LifecycleStateChanged = 'lifecycle_state_changed',
}

// The pg-boss queues this codebase uses (SCL-08, D25). Add a name here before any code enqueues to it.
export enum QueueName {
  Sms = 'sms',
  Mail = 'mail',
  // D27: a bounded retry for an OTP's failed synchronous send, kept apart from `Sms` since its jobs carry a
  // plaintext code and expire with that code, unlike whatever `Sms` ends up carrying later.
  OtpRetry = 'otp_retry',
}

// Who performed the action (AUD-02). `system` is the platform itself (a scheduled job); `platform_support` is an
// operator acting on a tenant, shown to the tenant as "Platform support" (AUD-08).
export enum ActorType {
  User = 'user',
  ApiKey = 'api_key',
  System = 'system',
  PlatformSupport = 'platform_support',
}

// Whether the audited action succeeded (AUD-02).
export enum AuditResult {
  Success = 'success',
  Failure = 'failure',
}

// Who performed a platform-level action (ADM-08), a separate, smaller list from ActorType above: the platform
// audit log only ever sees the operator console itself or a scheduled job, never a tenant-side actor.
export enum PlatformActorType {
  Operator = 'operator',
  System = 'system',
}

// The actions this codebase writes to control.platform_audit_log (ADM-08). Add a name here before any code
// writes it, same discipline as AuditAction for the tenant log.
export enum PlatformAuditAction {
  // ADM-18: break-glass recovery after an operator loses both their TOTP device and backup codes.
  BreakGlass2faReset = 'break_glass_2fa_reset',
  // RAT-05: every rate change, by the operator who made it.
  RateChanged = 'rate_changed',
  // BAL-17: an operator's balance adjustment, never a tenant-initiated change.
  BalanceAdjusted = 'balance_adjusted',
  // PLN-02/D2-3: a plan edit, each one preceded by its own version snapshot.
  PlanCreated = 'plan_created',
  PlanUpdated = 'plan_updated',
  PlanRetired = 'plan_retired',
  // PLN-17: mirrors AuditAction.PlanAssigned above, written to this log too (D2-5).
  PlanAssigned = 'plan_assigned',
  // PLN-11: a per-tenant limit override, set or removed.
  PlanLimitOverrideSet = 'plan_limit_override_set',
  PlanLimitOverrideRemoved = 'plan_limit_override_removed',
  // TRM-16: every billing-term change.
  BillingTermCreated = 'billing_term_created',
  BillingTermUpdated = 'billing_term_updated',
  BillingTermRetired = 'billing_term_retired',
  // LIF-26: a platform-wide setting change (e.g. trial length), by the operator who made it.
  SettingsChanged = 'settings_changed',
}

// BAL-02: what a balance-ledger entry is for. One list, shared by every module that ever charges or credits a
// tenant's balance — add a value here before any code writes a new kind of entry, never a second enum for it.
export enum LedgerEntryType {
  TopUp = 'top_up',
  Sms = 'sms',
  Ai = 'ai',
  Extraction = 'extraction',
  FraudCheck = 'fraud_check',
  OrderFee = 'order_fee',
  ProductFee = 'product_fee',
  PlanPayment = 'plan_payment',
  Adjustment = 'adjustment',
  Reversal = 'reversal',
}

// RAT-01: the platform-wide, per-use rates control.rates holds. Add a key here before any code reads or writes
// it — the single list of what "a rate" means on this platform.
export enum RateKey {
  SmsPerUnit = 'sms_per_unit',
  AiReply = 'ai_reply',
  FraudCheck = 'fraud_check',
  PaygOrderFeeMin = 'payg_order_fee_min',
  PaygOrderFeePct = 'payg_order_fee_pct',
  PaygProductFee = 'payg_product_fee',
  SmsUnitSizeChars = 'sms_unit_size_chars',
}

// LIF-26: every platform-wide editable value that isn't a per-use rate (those are RateKey above). Add a key
// here before any code reads or writes it. Trial length is the first; slice 7 adds the grace/read-only/
// locked stage lengths to this same list.
export enum PlatformSettingKey {
  TrialDays = 'trial_days',
}

/**
 * The values of a string enum as the non-empty tuple that Drizzle's `pgEnum` expects. Throws on an empty enum,
 * which cannot happen for the enums above; the check keeps the type honest without a cast.
 */
export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('an enum must have at least one value');
  return [first, ...rest];
}
