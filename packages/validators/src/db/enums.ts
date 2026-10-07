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

/**
 * The values of a string enum as the non-empty tuple that Drizzle's `pgEnum` expects. Throws on an empty enum,
 * which cannot happen for the enums above; the check keeps the type honest without a cast.
 */
export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('an enum must have at least one value');
  return [first, ...rest];
}
