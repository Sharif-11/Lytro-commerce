import type { ApiKeyPurpose } from '@lytronix/validators';

/** Mirrors `ApiKeyView` in apps/server/src/modules/public-api/types/public-api.ts (API-01): one of the shop's keys. */
export interface ApiKey {
  id: string;
  name: string;
  type: 'public';
  /** Slice 12a: `storefront` for the key Lytro keeps for the shop's storefront, which the shop cannot change. */
  purpose: ApiKeyPurpose | null;
  /** The key's first characters, to recognise it by. */
  prefix: string;
  websites: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** A key just made, with its value: the one time it is shown. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}
