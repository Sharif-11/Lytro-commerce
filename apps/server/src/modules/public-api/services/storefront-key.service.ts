import { Inject, Injectable } from '@nestjs/common';
import { ApiKeyPurpose, ApiKeyType } from '@lytronix/validators';
import { shopOrigin } from '../../../common/shop-address';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { SecretBox, SecretPurpose } from '../../shared/secrets/secret-box';
import type { ApiKeyStore } from '../ports/api-key-store';
import { API_KEY_STORE } from '../tokens';
import type { ApiKeyRecord } from '../types/public-api';
import { hashOfKey, newPublicKeyValue, shownPrefixOf } from './api-key-value';

// What the shop sees the key as in its API keys list.
const STOREFRONT_KEY_NAME = 'Lytro storefront';

/** The storefront key the storefront's server presents, and the website address it is registered for. */
export interface StorefrontKey {
  value: string;
  origin: string;
}

/**
 * SFT-11, SFT-15, agreed 2026-10-29: the public key the shop's shared storefront calls the public API with, so its
 * pages are counted and limited exactly as any website's calls are. Made on first asking, one per shop, registered for
 * the shop's own address; kept sealed (SEC-10), since its server must present it. The shop sees it in its keys but
 * never changes or revokes it (ApiKeyService).
 */
@Injectable()
export class StorefrontKeyService {
  private readonly opened = new Map<string, string>();

  constructor(
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(ENV) private readonly env: Pick<Env, 'NODE_ENV' | 'PLATFORM_DOMAIN'>,
  ) {}

  async keyFor(tenantId: string, slug: string): Promise<StorefrontKey> {
    const origin = shopOrigin(this.env, slug);
    const known = this.opened.get(tenantId);
    if (known !== undefined) return { value: known, origin };
    const found = await this.store.findStorefrontKey(tenantId);
    if (found) return { value: this.open(found), origin };
    const value = newPublicKeyValue();
    const made = await this.store.insertStorefrontKey({
      tenantId,
      type: ApiKeyType.Public,
      purpose: ApiKeyPurpose.Storefront,
      name: STOREFRONT_KEY_NAME,
      prefix: shownPrefixOf(value),
      keyHash: hashOfKey(value),
      sealedValue: this.box.seal(value, SecretPurpose.StorefrontKey, tenantId),
      websites: [origin],
      expiresAt: null,
      createdBy: null,
    });
    if (made) {
      this.opened.set(tenantId, value);
      return { value, origin };
    }
    // Another request made the shop's key a moment before.
    const first = await this.store.findStorefrontKey(tenantId);
    if (!first) throw new Error('the storefront key was neither made nor found');
    return { value: this.open(first), origin };
  }

  private open(row: ApiKeyRecord): string {
    if (row.sealedValue === null) throw new Error('a storefront key is kept sealed');
    const value = this.box.open(row.sealedValue, SecretPurpose.StorefrontKey, row.tenantId);
    this.opened.set(row.tenantId, value);
    return value;
  }
}
