/** Slice 9.4: every rate limit's one store (ports/limit-store.ts). */
export const LIMIT_STORE = Symbol('LIMIT_STORE');
/** Slice 9.4: the limits' tables (ports/limits-database.ts). */
export const LIMITS_DATABASE = Symbol('LIMITS_DATABASE');
/** Slice 9.4: the Redis client, or null where REDIS_URL isn't set. */
export const LIMITS_REDIS = Symbol('LIMITS_REDIS');
