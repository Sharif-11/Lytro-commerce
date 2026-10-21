import { MEDIA_PRIVATE_FOLDER, MEDIA_TENANT_PREFIX } from '@lytronix/shared-types';

const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A stored name's parts: letters, digits, `.`, `_` and `-`, never starting with a dot. So no `.`, `..`, empty part or
// escaped character can reach a key outside the shop's prefix.
const PART = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** What a media path asks for: the shop it belongs to, the object's key, and whether it is private (BND-07). */
export interface MediaTarget {
  tenantId: string;
  key: string;
  private: boolean;
}

/**
 * MED-01, TEN-06: a media path is the object's key -- `/tenants/<shop id>/<rest>` -- and names only that shop's
 * objects. Anything else is no media at all.
 */
export function readMediaPath(pathname: string): MediaTarget | null {
  if (!pathname.startsWith(`/${MEDIA_TENANT_PREFIX}`)) return null;
  const key = pathname.slice(1);
  const [, tenantId, ...rest] = key.split('/');
  if (tenantId === undefined || !SHOP_ID.test(tenantId) || rest.length === 0) return null;
  if (!rest.every((part) => PART.test(part))) return null;
  return { tenantId, key, private: rest.length > 1 && rest[0] === MEDIA_PRIVATE_FOLDER };
}
