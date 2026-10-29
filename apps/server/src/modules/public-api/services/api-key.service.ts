import { Inject, Injectable } from '@nestjs/common';
import {
  API_KEYS_LIVE_MAX,
  ApiKeyType,
  AuditAction,
  FieldProblemCode,
  type CreateApiKeyInput,
  type UpdateApiKeyInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { ApiKeyStore } from '../ports/api-key-store';
import { API_CLOCK, API_KEY_STORE } from '../tokens';
import type { ApiKeyRecord, ApiKeyView, CreatedApiKeyView } from '../types/public-api';
import { ApiKeyAuthenticator } from './api-key-authenticator';
import { hashOfKey, newPublicKeyValue, shownPrefixOf } from './api-key-value';

function viewOf(row: ApiKeyRecord): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    prefix: row.prefix,
    websites: row.websites,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    purpose: row.purpose,
  };
}

/** Slice 12: Lytro's storefront key is the platform's, so the shop sees it but never changes or revokes it. */
function refuseManaged(row: ApiKeyRecord): void {
  if (row.purpose !== null) throw new ApiError('conflict', 'ApiKeyManagedByLytro', {});
}

/**
 * API-01, API-02, API-21, API-24: a shop's public API keys, as the dashboard manages them. A key's value is shown once,
 * when it is made; only its hash is kept. A shop holds at most 20 live keys, so it can rotate one by making the next
 * before revoking the last. Making, changing and revoking a key are in the activity log, by the key's name and
 * prefix, never its value.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(ApiKeyAuthenticator) private readonly authenticator: ApiKeyAuthenticator,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The shop's keys, newest first, revoked ones included. */
  async list(tenantId: string): Promise<ApiKeyView[]> {
    return (await this.store.listForTenant(tenantId)).map(viewOf);
  }

  async create(
    tenantId: string,
    input: CreateApiKeyInput,
    actor: CatalogueActor,
  ): Promise<CreatedApiKeyView> {
    const who = await this.activity.resolve(tenantId, actor);
    const now = this.clock();
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt !== null && expiresAt <= now) {
      throw new FieldsError([
        {
          field: 'expiresAt',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'ApiKeyExpiryInPast',
        },
      ]);
    }
    const value = newPublicKeyValue();
    const row = await this.store.run(async (tx) => {
      if ((await this.store.lockAndCountLive(tx, tenantId, now)) >= API_KEYS_LIVE_MAX) {
        throw new ApiError(
          'plan_limit_reached',
          'TooManyApiKeys',
          { limit: API_KEYS_LIVE_MAX },
          undefined,
          { max: API_KEYS_LIVE_MAX },
        );
      }
      const made = await this.store.insert(tx, {
        tenantId,
        type: ApiKeyType.Public,
        name: input.name,
        prefix: shownPrefixOf(value),
        keyHash: hashOfKey(value),
        websites: input.websites,
        expiresAt,
        createdBy: who.id,
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ApiKeyCreated,
        { type: 'api_key', id: made.id },
        { name: made.name, prefix: made.prefix, websites: made.websites, expiresAt },
      );
      return made;
    });
    return { ...viewOf(row), key: value };
  }

  /** A live key's name or website addresses. */
  async update(
    tenantId: string,
    id: string,
    input: UpdateApiKeyInput,
    actor: CatalogueActor,
  ): Promise<ApiKeyView> {
    const who = await this.activity.resolve(tenantId, actor);
    const row = await this.store.run(async (tx) => {
      const current = await this.store.findForTenant(tx, tenantId, id);
      if (!current) throw new ApiError('not_found', 'ApiKeyNotFound', {});
      refuseManaged(current);
      if (current.revokedAt !== null) throw new ApiError('conflict', 'ApiKeyWasRevoked', {});
      if (input.name === undefined && input.websites === undefined) return current;
      const updated = await this.store.update(tx, tenantId, id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.websites !== undefined ? { websites: input.websites } : {}),
      });
      if (!updated) throw new ApiError('conflict', 'ApiKeyWasRevoked', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ApiKeyUpdated,
        { type: 'api_key', id },
        { name: updated.name, prefix: updated.prefix, websites: updated.websites },
      );
      return updated;
    });
    this.authenticator.forget(row.keyHash);
    return viewOf(row);
  }

  /** API-03: the key stops working, on this server at once and on any other within five seconds. */
  async revoke(tenantId: string, id: string, actor: CatalogueActor): Promise<ApiKeyView> {
    const who = await this.activity.resolve(tenantId, actor);
    const now = this.clock();
    const row = await this.store.run(async (tx) => {
      const current = await this.store.findForTenant(tx, tenantId, id);
      if (!current) throw new ApiError('not_found', 'ApiKeyNotFound', {});
      refuseManaged(current);
      if (current.revokedAt !== null) return current;
      const revoked = await this.store.revoke(tx, tenantId, id, who.id, now);
      if (!revoked) throw new ApiError('not_found', 'ApiKeyNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ApiKeyRevoked,
        { type: 'api_key', id },
        { name: revoked.name, prefix: revoked.prefix },
      );
      return revoked;
    });
    this.authenticator.forget(row.keyHash);
    return viewOf(row);
  }
}
