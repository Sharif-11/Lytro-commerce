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

/**
 * The values of a string enum as the non-empty tuple that Drizzle's `pgEnum` expects. Throws on an empty enum,
 * which cannot happen for the enums above; the check keeps the type honest without a cast.
 */
export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('an enum must have at least one value');
  return [first, ...rest];
}
