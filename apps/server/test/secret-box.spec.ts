import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SecretBox,
  SecretPurpose,
  SecretUnreadable,
} from '../src/modules/shared/secrets/secret-box';

// SEC-01, SEC-10: the server's sealed storage for credentials.
const SHOP = '0b9f6a3e-6f3c-4f7e-9d2a-1c2b3d4e5f60';
const OTHER = '9a1c2b3d-4e5f-4607-8a9b-0c1d2e3f4a5b';
const TOKEN = 'EAAG-a-meta-conversions-token';

function box(current = randomBytes(32), previous: Buffer | null = null): SecretBox {
  return new SecretBox({ current, previous });
}

describe('SecretBox (SEC-01, SEC-10)', () => {
  it('opens what it sealed, and never stores the value in the clear', () => {
    const secrets = box();
    const sealed = secrets.seal(TOKEN, SecretPurpose.ConversionsApiToken, SHOP);
    expect(sealed.toString('latin1')).not.toContain(TOKEN);
    expect(secrets.open(sealed, SecretPurpose.ConversionsApiToken, SHOP)).toBe(TOKEN);
    // A fresh nonce each time: the same value never seals the same twice.
    expect(secrets.seal(TOKEN, SecretPurpose.ConversionsApiToken, SHOP).equals(sealed)).toBe(false);
  });

  it('does not open for another shop or another purpose, or once changed', () => {
    const secrets = box();
    const sealed = secrets.seal(TOKEN, SecretPurpose.ConversionsApiToken, SHOP);
    expect(() => secrets.open(sealed, SecretPurpose.ConversionsApiToken, OTHER)).toThrow(
      SecretUnreadable,
    );
    expect(() => secrets.open(sealed, SecretPurpose.CatalogFeedToken, SHOP)).toThrow(
      SecretUnreadable,
    );
    const changed = Buffer.from(sealed);
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    expect(() => secrets.open(changed, SecretPurpose.ConversionsApiToken, SHOP)).toThrow(
      SecretUnreadable,
    );
    expect(() =>
      secrets.open(Buffer.from('short'), SecretPurpose.ConversionsApiToken, SHOP),
    ).toThrow(SecretUnreadable);
  });

  it('still opens what the previous key sealed while a rotation moves values over, and not with neither', () => {
    const old = randomBytes(32);
    const sealed = box(old).seal(TOKEN, SecretPurpose.CatalogFeedToken, SHOP);
    const rotated = box(randomBytes(32), old);
    expect(rotated.open(sealed, SecretPurpose.CatalogFeedToken, SHOP)).toBe(TOKEN);
    expect(() => box().open(sealed, SecretPurpose.CatalogFeedToken, SHOP)).toThrow(
      SecretUnreadable,
    );
  });
});
