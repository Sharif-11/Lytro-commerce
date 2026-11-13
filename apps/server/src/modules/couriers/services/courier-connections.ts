import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectCourierAdapter, SelectCourierConnection, Transaction } from '@lytronix/db';
import {
  AuditAction,
  RetireState,
  CourierCallAction,
  CourierConnectionState,
  CourierMessagesState,
  FieldProblemCode,
  type ConnectCourierInput,
  type CourierKey,
  type SetPickupStoreInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { CircuitOpen } from '../../../common/circuit-breaker';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { LIMIT_STORE } from '../../shared/limits/tokens';
import { DAY_MS, MINUTE_MS } from '../../../common/time';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { SecretBox, SecretPurpose, SecretUnreadable } from '../../shared/secrets/secret-box';
import {
  CourierNoAnswer,
  PICKUP_STORE_ID,
  PICKUP_STORE_NAME,
  type CourierAccount,
  type CourierAdapter,
  type LogInAnswer,
  type PickupStore,
} from '../ports/courier-adapter';
import type { CourierAdapterStore } from '../ports/courier-adapter-store';
import type { CourierNotifier } from '../ports/courier-notifier';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_ADAPTER_STORE, COURIER_CLOCK, COURIER_NOTIFIER, COURIER_STORE } from '../tokens';
import { CourierCalls } from './courier-calls';
import { CourierMessages, type MessageAddress } from './courier-messages';
import { CourierRegistry } from './courier-registry';

// Steadfast locks a key out for an hour after 10 failures in 5 minutes, correct keys included (§3.6), so a shop trying keys stops
// well short of that.
const CONNECT_FAILURES = 5;
const CONNECT_WINDOW_MS = 5 * MINUTE_MS;
// A courier the circuit has stopped calling is tried again after this.
const RETRY_AFTER_SECONDS = 60;

/** CRR-01: a courier a shop can connect, and what it needs. */
export interface CourierAdapterView {
  key: CourierKey;
  name: string;
  credentialFields: string[];
  needsArea: boolean;
  /** Read agreed 2026-11-05: an order needs a thana before this courier can book it. */
  needsThana: boolean;
  /** Read agreed 2026-11-05: its bookings leave from one store, chosen for the connection. */
  hasStores: boolean;
  takesWeight: boolean;
  /** D6-8: it can be cancelled from Lytro; otherwise staff confirm they did it in its panel. */
  canCancel: boolean;
  /** CRR-23 (Slice 6.6): being retired; listed only for a shop already connected to it. */
  retiring: boolean;
}

/** CRR-03: a connection as anyone sees it: whether it has credentials, never what they are. */
export interface CourierConnectionView {
  courierKey: CourierKey;
  name: string;
  isDefault: boolean;
  /**
   * Slice 9.7: false when the saved login can no longer be opened (the sealing key changed without a re-seal); the
   * connection then shows as refused, for the owner to enter the login again, never as a failed list.
   */
  hasCredentials: boolean;
  state: CourierConnectionState;
  connectedAt: Date;
  /** CRR-02, D6-3: whether its messages are arriving, none yet, or arriving without the token. */
  messages: CourierMessagesState;
  lastMessageAt: Date | null;
  /**
   * CRR-15 (Slice 6.7): when the night check found news no message brought, on a connection whose messages had been arriving;
   * null once a message has come since.
   */
  messagesMissedAt: Date | null;
  /** Read agreed 2026-11-05: where its parcels leave from; null for a courier with no stores, or none chosen yet. */
  pickupStore: { id: string; name: string } | null;
  /** CRR-23, CRR-25 (Slice 6.6): being retired, and the courier the operator suggests instead. */
  retiring: boolean;
  suggestedKey: CourierKey | null;
  /** Slice 6.7 (c36-back): when the shop was told its courier is back, for [7] days after; null while it is retiring again. */
  backSince: Date | null;
  /** D6-11: whether a lost answer can be asked again by the order's number, or must be settled from the courier's panel. */
  asksByOrderNumber: boolean;
}

/** Slice 6.7, the user's pick 2026-11-07: how long a shop sees that a courier whose retiring was undone is back. */
export const COURIER_BACK_SHOWN_DAYS = 7;

/** A connection opened for one call (SEC-09). */
export interface OpenedConnection {
  adapter: CourierAdapter;
  account: CourierAccount;
}

/**
 * CRR-01 to CRR-05, CRR-20, SEC-08, AUD-01 (Phase 6 Slice 6.1, read agreed 2026-11-04: `couriers:manage`): a shop's connections to its
 * couriers, on its own accounts. New credentials are tried with a test call and saved only if the courier takes them; sealed as
 * they arrive and never returned. Blank fields keep what is saved. The first connection is the default. Disconnecting removes the
 * credentials and leaves its parcels.
 */
@Injectable()
export class CourierConnections {
  private readonly logger = new Logger('CourierConnections');

  constructor(
    @Inject(LIMIT_STORE) private readonly limitStore: LimitStore,
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(COURIER_ADAPTER_STORE) private readonly adapterStates: CourierAdapterStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(CourierMessages) private readonly messages: CourierMessages,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(COURIER_NOTIFIER) private readonly notifier: CourierNotifier,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** CRR-01, CRR-23 (Slice 6.6): a removed courier is gone, and a retiring one is offered only to a shop already connected to it. */
  async adapters(tenantId: string): Promise<CourierAdapterView[]> {
    const states = await this.states();
    const connected = new Set(
      (await this.store.run(tenantId, (tx) => this.store.listConnections(tx, tenantId))).map(
        (row) => row.courierKey,
      ),
    );
    return this.registry
      .all()
      .filter((adapter) => {
        const state = this.stateOf(states, adapter.key);
        return (
          state === RetireState.Active ||
          (state === RetireState.Retiring && connected.has(adapter.key))
        );
      })
      .map((adapter) => ({
        key: adapter.key,
        name: adapter.name,
        credentialFields: [...adapter.credentialFields],
        needsArea: adapter.needsArea,
        needsThana: adapter.needsThana,
        hasStores: adapter.pickupStores !== undefined,
        takesWeight: adapter.limits.weightKg !== null,
        canCancel: adapter.cancel !== undefined,
        retiring: this.stateOf(states, adapter.key) === RetireState.Retiring,
      }));
  }

  async list(tenantId: string): Promise<CourierConnectionView[]> {
    const states = await this.states();
    const { rows, back } = await this.store.run(tenantId, async (tx) => ({
      rows: await this.store.listConnections(tx, tenantId),
      back: await this.backOf(tx, tenantId),
    }));
    return rows.map((row) => this.viewOf(row, states, back));
  }

  /** CRR-02, CRR-03, CRR-04: connects a courier, or replaces its credentials. Refused credentials save nothing. */
  async connect(
    tenantId: string,
    input: ConnectCourierInput,
    actor: CatalogueActor,
  ): Promise<CourierConnectionView & { message: MessageAddress }> {
    const adapter = this.adapterOf(input.courierKey);
    const who = await this.activity.resolve(tenantId, actor);
    const saved = await this.store.run(tenantId, (tx) =>
      this.store.findConnection(tx, tenantId, input.courierKey),
    );
    // CRR-23 (Slice 6.6): a retiring courier takes no new shop, and a shop already connected may still replace its keys.
    const states = await this.states();
    // Checked first so a refusal costs no call to the courier, and again under the lock when saving.
    this.refuseUnavailable(adapter, this.stateOf(states, adapter.key), saved !== null);
    const credentials = this.credentialsOf(adapter, input, saved, tenantId);
    const bucket = `courier-connect:${tenantId}:${adapter.key}`;
    const now = this.clock();
    if (!(await this.limitStore.peek(bucket, CONNECT_FAILURES, CONNECT_WINDOW_MS, now)).allowed) {
      throw new ApiError(
        'rate_limited',
        'CourierConnectTooManyTries',
        {},
        CONNECT_WINDOW_MS / 1000,
      );
    }
    const logged = await this.tryCredentials(
      adapter,
      tenantId,
      saved?.id ?? null,
      credentials,
      bucket,
      now,
    );
    const kept = await this.withStore(adapter, tenantId, saved, logged);

    try {
      return await this.store.run(tenantId, async (tx) => {
        // Phase 6 close-out: one shop's connections save one at a time, so two first ones can't both be its default; and the
        // courier is read again, held as booking's claim holds it, so a retire or a removal while the keys were tried wins.
        await this.store.lockConnections(tx, tenantId);
        const current = await this.store.findConnection(tx, tenantId, adapter.key);
        this.refuseUnavailable(
          adapter,
          await this.store.adapterStateWithin(tx, adapter.key),
          current !== null,
        );
        const others = await this.store.listConnections(tx, tenantId);
        const row = await this.store.saveConnection(
          tx,
          tenantId,
          {
            courierKey: adapter.key,
            credentials: this.sealed(kept, tenantId),
            isDefault: others.length === 0,
            state: CourierConnectionState.Active,
            accountFingerprint: this.fingerprintOf(adapter, kept),
          },
          now,
        );
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.CourierConnected,
          { type: 'courier', id: row.id },
          { courierKey: adapter.key, replaced: saved !== null },
        );
        // CRR-02: what to paste into the courier's panel; connecting never waits on it.
        const message = await this.messages.makeIfMissing(tx, tenantId, adapter.key, row);
        return { ...this.viewOf(row, states, await this.backOf(tx, tenantId)), message };
      });
    } catch (error) {
      // Agreed 2026-11-07: one courier account serves one shop.
      if (error instanceof UniqueViolation && error.target === 'account') {
        throw new ApiError(
          'conflict',
          'CourierAccountInUse',
          { courierKey: adapter.key },
          undefined,
          {
            courier: adapter.name,
          },
        );
      }
      throw error;
    }
  }

  /** CRR-23: a removed courier takes no one, and a retiring one no new shop; a shop already connected may still replace its keys. */
  private refuseUnavailable(adapter: CourierAdapter, state: RetireState, connected: boolean): void {
    if (state === RetireState.Removed) {
      throw new ApiError('not_found', 'CourierNotAvailable', {});
    }
    if (state === RetireState.Retiring && !connected) {
      throw new ApiError('conflict', 'CourierRetiring', { courierKey: adapter.key }, undefined, {
        courier: adapter.name,
      });
    }
  }

  /** Phase 6 close-out (agreed 2026-11-07): which account this is, as a fingerprint, never the credential itself. */
  private fingerprintOf(
    adapter: CourierAdapter,
    credentials: Record<string, string>,
  ): string | null {
    const value = credentials[adapter.accountField]?.trim();
    if (!value) return null;
    return createHash('sha256').update(`courier-account:v1:${adapter.key}:${value}`).digest('hex');
  }

  /** CRR-20: its credentials go; its parcels stay. If it was the default, the oldest other connection takes over. */
  async disconnect(tenantId: string, courierKey: CourierKey, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(tenantId, async (tx) => {
      const row = await this.store.deleteConnection(tx, tenantId, courierKey);
      if (!row) throw new ApiError('not_found', 'CourierNotConnected', {});
      await this.messages.forgetRoute(tx, row.id);
      if (row.isDefault) {
        const [next] = await this.store.listConnections(tx, tenantId);
        if (next) {
          await this.store.setDefaultConnection(tx, tenantId, next.courierKey, this.clock());
        }
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CourierDisconnected,
        { type: 'courier', id: row.id },
        { courierKey },
      );
    });
  }

  /** CRR-05. */
  async setDefault(
    tenantId: string,
    courierKey: CourierKey,
    actor: CatalogueActor,
  ): Promise<CourierConnectionView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const row = await this.store.setDefaultConnection(tx, tenantId, courierKey, this.clock());
      if (!row) throw new ApiError('not_found', 'CourierNotConnected', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CourierDefaultChanged,
        { type: 'courier', id: row.id },
        { courierKey },
      );
      return this.viewOf(row, await this.states(), await this.backOf(tx, tenantId));
    });
  }

  /** CRR-05: the courier staff chose, or the shop's default; opened for the call, in the caller's transaction. */
  async chosenWithin(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey | undefined,
  ): Promise<OpenedConnection> {
    const row =
      courierKey !== undefined
        ? await this.store.findConnection(tx, tenantId, courierKey)
        : await this.store.findDefaultConnection(tx, tenantId);
    if (!row) {
      throw new ApiError(
        'conflict',
        courierKey !== undefined ? 'CourierNotConnected' : 'NoDefaultCourier',
        {},
      );
    }
    // CRR-24 (Slice 6.6): read shared, so removing this courier waits for this claim, and no claim starts once it is removed.
    if ((await this.store.adapterStateWithin(tx, row.courierKey)) === RetireState.Removed) {
      throw new ApiError('conflict', 'CourierNotAvailable', {});
    }
    return this.opened(row, tenantId);
  }

  /** D6-8, D6-11: this courier's connection, if the shop still has it; a parcel outlives its connection (CRR-20). */
  async openedWithin(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<OpenedConnection | null> {
    const row = await this.store.findConnection(tx, tenantId, courierKey);
    return row && row.state === CourierConnectionState.Active ? this.opened(row, tenantId) : null;
  }

  /**
   * Slice 6.3, read agreed 2026-11-05: renews a login that needs it, before anything else is set aside for a call, and refuses to go on with
   * one that has ended. It may work only once, so the connection is held across this one call, which is the only courier call ever made
   * inside a transaction: it is rare, it holds nothing but this connection, and whoever waited finds it done. Lytro doesn't keep the
   * password, so if the courier refuses, the connection stops and the owner is told to log in again. A courier with no login that ends
   * passes straight through.
   */
  async renewIfDue(tenantId: string, courierKey: CourierKey | undefined): Promise<void> {
    const found = await this.store.run(tenantId, (tx) =>
      courierKey !== undefined
        ? this.store.findConnection(tx, tenantId, courierKey)
        : this.store.findDefaultConnection(tx, tenantId),
    );
    const adapter = found ? this.registry.of(found.courierKey) : undefined;
    if (!found || !adapter?.renewLogin || !adapter.renewalDue) return;
    const renewalDue = adapter.renewalDue.bind(adapter);
    const renewLogin = adapter.renewLogin.bind(adapter);
    const key = found.courierKey;
    const needsLogin = () =>
      new ApiError('conflict', 'CourierLoginNeeded', { courierKey: key }, undefined, {
        courier: adapter.name,
      });
    if (found.state !== CourierConnectionState.Active) throw needsLogin();
    if (!renewalDue(this.opened(found, tenantId).account.credentials, this.clock())) return;
    let outcome: 'fine' | 'refused' | 'ended';
    try {
      outcome = await this.store.run(tenantId, async (tx): Promise<typeof outcome> => {
        const row = await this.store.lockConnection(tx, tenantId, key);
        if (!row) return 'fine';
        // Whoever held it found the login refused, and has told the owner.
        if (row.state !== CourierConnectionState.Active) return 'ended';
        const { account } = this.opened(row, tenantId);
        if (!renewalDue(account.credentials, this.clock())) return 'fine';
        const answer = await this.calls.run(
          adapter,
          {
            tenantId,
            connectionId: row.id,
            orderId: null,
            action: CourierCallAction.Renew,
          },
          () => renewLogin(account),
        );
        const now = this.clock();
        if (answer.outcome === 'accepted') {
          await this.store.updateConnection(
            tx,
            tenantId,
            row.id,
            { credentials: this.sealed(answer.credentials, tenantId) },
            now,
          );
          return 'fine';
        }
        await this.store.updateConnection(
          tx,
          tenantId,
          row.id,
          { state: CourierConnectionState.LoginRefused },
          now,
        );
        return 'refused';
      });
    } catch (error) {
      if (this.gaveNoAnswer(error)) throw this.notAnswering(adapter);
      throw error;
    }
    if (outcome === 'refused') {
      await this.tellLoginRefused(tenantId, key);
    }
    if (outcome !== 'fine') throw needsLogin();
  }

  /** Read agreed 2026-11-05: the stores the courier lists for this account, and which is chosen. */
  async pickupStores(
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<{ stores: PickupStore[]; chosenId: string | null }> {
    const adapter = this.adapterOf(courierKey);
    if (!adapter.pickupStores) throw new ApiError('not_found', 'CourierHasNoStores', {});
    await this.renewIfDue(tenantId, courierKey);
    const row = await this.store.run(tenantId, (tx) =>
      this.store.findConnection(tx, tenantId, courierKey),
    );
    if (!row) throw new ApiError('not_found', 'CourierNotConnected', {});
    const { account } = this.opened(row, tenantId);
    return {
      stores: await this.storesOf(adapter, account),
      chosenId: account.credentials[PICKUP_STORE_ID] ?? null,
    };
  }

  /** Read agreed 2026-11-05: which store this courier's parcels leave from; it must be one the courier lists as active right now. */
  async setPickupStore(
    tenantId: string,
    courierKey: CourierKey,
    input: SetPickupStoreInput,
    actor: CatalogueActor,
  ): Promise<CourierConnectionView> {
    const adapter = this.adapterOf(courierKey);
    const who = await this.activity.resolve(tenantId, actor);
    const { stores } = await this.pickupStores(tenantId, courierKey);
    const store = stores.find((each) => each.id === input.storeId && each.active);
    if (!store) {
      throw new ApiError('conflict', 'CourierStoreNotFound', {}, undefined, {
        courier: adapter.name,
      });
    }
    return this.store.run(tenantId, async (tx) => {
      // Held, so a renewal finishing now can't be overwritten with the tokens it has just ended.
      const row = await this.store.lockConnection(tx, tenantId, courierKey);
      if (!row) throw new ApiError('not_found', 'CourierNotConnected', {});
      const credentials = {
        ...this.opened(row, tenantId).account.credentials,
        [PICKUP_STORE_ID]: store.id,
        [PICKUP_STORE_NAME]: store.name,
      };
      const sealed = this.sealed(credentials, tenantId);
      await this.store.updateConnection(
        tx,
        tenantId,
        row.id,
        { credentials: sealed },
        this.clock(),
      );
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CourierPickupStoreChanged,
        { type: 'courier', id: row.id },
        { courierKey, storeId: store.id },
      );
      return this.viewOf(
        { ...row, credentials: sealed },
        await this.states(),
        await this.backOf(tx, tenantId),
      );
    });
  }

  /** LIF-19: the day-60 deletion's couriers step. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.deleteAllForTenant(tenantId);
  }

  /** SEC-11: the shop's log of its courier credentials' uses, for the operator; the failed ones alone when asked. */
  async uses(tenantId: string, page: number, limit: number, failedOnly = false) {
    const found = await this.store.listUses(tenantId, {
      offset: (page - 1) * limit,
      limit,
      failedOnly,
    });
    return {
      uses: found.rows.map((row) => ({
        courierKey: row.courierKey,
        action: row.action,
        connectionId: row.connectionId,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        succeeded: row.succeeded,
        at: row.at,
      })),
      page,
      limit,
      total: found.total,
      pages: Math.ceil(found.total / limit),
    };
  }

  /**
   * ADM-03, MON-05: how many of the shop's courier calls failed or were refused since `since`. A call its open circuit
   * stopped was never made, so it isn't one (KNOWN-GAPS §133).
   */
  failedCalls(tenantId: string, since: Date): Promise<number> {
    return this.store.countFailedUses(tenantId, since);
  }

  private async tryCredentials(
    adapter: CourierAdapter,
    tenantId: string,
    connectionId: string | null,
    credentials: Record<string, string>,
    bucket: string,
    now: Date,
  ): Promise<Record<string, string>> {
    const account = { tenantId, connectionId: connectionId ?? '', credentials };
    const logIn = adapter.logIn?.bind(adapter);
    try {
      const answer = await this.calls.run(
        adapter,
        { tenantId, connectionId, orderId: null, action: CourierCallAction.Test },
        async (): Promise<LogInAnswer> => {
          if (logIn) return logIn(credentials);
          const tested = await adapter.testConnection(account);
          return tested.outcome === 'accepted' ? { outcome: 'accepted', credentials } : tested;
        },
      );
      if (answer.outcome === 'accepted') return answer.credentials;
      await this.limitStore.take(bucket, CONNECT_FAILURES, CONNECT_WINDOW_MS, now);
      const { message } = answer.refusal;
      throw new ApiError(
        'conflict',
        message === null ? 'CourierRefusedKeysNoReason' : 'CourierRefusedKeys',
        { courierKey: adapter.key, courierMessage: message },
        undefined,
        { courier: adapter.name, message: message ?? '' },
      );
    } catch (error) {
      if (this.gaveNoAnswer(error)) throw this.notAnswering(adapter);
      throw error;
    }
  }

  private gaveNoAnswer(error: unknown): boolean {
    return error instanceof CircuitOpen || error instanceof CourierNoAnswer;
  }

  private notAnswering(adapter: CourierAdapter): ApiError {
    return new ApiError(
      'service_unavailable',
      'CourierNotAnswering',
      { courierKey: adapter.key },
      RETRY_AFTER_SECONDS,
      { courier: adapter.name },
    );
  }

  private async tellLoginRefused(tenantId: string, courierKey: CourierKey): Promise<void> {
    try {
      await this.notifier.connectionTrouble({ tenantId, courierKey, trouble: 'login_refused' });
    } catch (error) {
      this.logger.error('could not tell the owner of a refused login', error as Error);
    }
  }

  private async storesOf(adapter: CourierAdapter, account: CourierAccount): Promise<PickupStore[]> {
    const pickupStores = adapter.pickupStores?.bind(adapter);
    if (!pickupStores) return [];
    try {
      const answer = await this.calls.run(
        adapter,
        {
          tenantId: account.tenantId,
          connectionId: account.connectionId || null,
          orderId: null,
          action: CourierCallAction.Test,
        },
        () => pickupStores(account),
      );
      if (answer.outcome === 'found') return answer.stores;
      const { message } = answer.refusal;
      throw new ApiError(
        'conflict',
        message === null ? 'CourierRefusedNoReason' : 'CourierRefused',
        { courierKey: adapter.key, courierMessage: message },
        undefined,
        { courier: adapter.name, message: message ?? '' },
      );
    } catch (error) {
      if (this.gaveNoAnswer(error)) throw this.notAnswering(adapter);
      throw error;
    }
  }

  /**
   * Read agreed 2026-11-05: the store connecting leaves chosen: the one chosen before if it's still active, otherwise the only active one.
   * With several to choose from, or the list out of reach, the connection is made and booking asks for a store until one is set.
   */
  private async withStore(
    adapter: CourierAdapter,
    tenantId: string,
    saved: SelectCourierConnection | null,
    credentials: Record<string, string>,
  ): Promise<Record<string, string>> {
    if (!adapter.pickupStores) return credentials;
    const before = saved ? this.opened(saved, tenantId).account.credentials : {};
    const account = { tenantId, connectionId: saved?.id ?? '', credentials };
    let active: PickupStore[];
    try {
      active = (await this.storesOf(adapter, account)).filter((store) => store.active);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      this.logger.warn(`could not list ${adapter.key} stores on tenant ${tenantId}`);
      return credentials;
    }
    const chosen =
      active.find((store) => store.id === before[PICKUP_STORE_ID]) ??
      (active.length === 1 ? active[0] : undefined);
    return chosen
      ? { ...credentials, [PICKUP_STORE_ID]: chosen.id, [PICKUP_STORE_NAME]: chosen.name }
      : credentials;
  }

  private sealed(credentials: Record<string, string>, tenantId: string): Buffer {
    return this.box.seal(JSON.stringify(credentials), SecretPurpose.CourierCredentials, tenantId);
  }

  /** CRR-02, CRR-03: every field the courier needs, from the request or, left blank, what is saved; nothing it doesn't. */
  private credentialsOf(
    adapter: CourierAdapter,
    input: ConnectCourierInput,
    saved: SelectCourierConnection | null,
    tenantId: string,
  ): Record<string, string> {
    const kept = saved ? this.opened(saved, tenantId).account.credentials : {};
    const strays = Object.keys(input.credentials).filter(
      (field) => !adapter.credentialFields.includes(field),
    );
    if (strays.length > 0) {
      throw new FieldsError(
        strays.map((field) => ({
          field: `credentials.${field}`,
          problem: FieldProblemCode.NotAllowed,
        })),
      );
    }
    const credentials: Record<string, string> = {};
    const missing: string[] = [];
    for (const field of adapter.credentialFields) {
      const value = input.credentials[field] || kept[field];
      if (value) credentials[field] = value;
      else missing.push(field);
    }
    if (missing.length > 0) {
      throw new FieldsError(
        missing.map((field) => ({
          field: `credentials.${field}`,
          problem: FieldProblemCode.Required,
        })),
      );
    }
    return credentials;
  }

  private opened(row: SelectCourierConnection, tenantId: string): OpenedConnection {
    const adapter = this.adapterOf(row.courierKey);
    const credentials = JSON.parse(
      this.box.open(row.credentials, SecretPurpose.CourierCredentials, tenantId),
    ) as Record<string, string>;
    return { adapter, account: { tenantId, connectionId: row.id, credentials } };
  }

  private adapterOf(key: CourierKey): CourierAdapter {
    const adapter = this.registry.of(key);
    if (!adapter) throw new ApiError('not_found', 'CourierNotAvailable', {});
    return adapter;
  }

  /** Slice 6.6: each courier's platform-wide state; a courier with no row is active. */
  private async states(): Promise<Map<CourierKey, SelectCourierAdapter>> {
    return new Map((await this.adapterStates.all()).map((row) => [row.courierKey, row]));
  }

  private stateOf(
    states: Map<CourierKey, SelectCourierAdapter>,
    courierKey: CourierKey,
  ): RetireState {
    return states.get(courierKey)?.state ?? RetireState.Active;
  }

  /** Slice 6.7 (c36-back): the connections told their courier is back within the days it shows. */
  private backOf(tx: Transaction, tenantId: string): Promise<Map<string, Date>> {
    const since = new Date(this.clock().getTime() - COURIER_BACK_SHOWN_DAYS * DAY_MS);
    return this.store.retiringUndoneSince(tx, tenantId, since);
  }

  private viewOf(
    row: SelectCourierConnection,
    states: Map<CourierKey, SelectCourierAdapter>,
    back: Map<string, Date>,
  ): CourierConnectionView {
    const platform = states.get(row.courierKey);
    const retiring = platform?.state === RetireState.Retiring;
    const adapter = this.adapterOf(row.courierKey);
    const credentials = this.readableCredentials(row);
    return {
      courierKey: row.courierKey,
      name: adapter.name,
      isDefault: row.isDefault,
      hasCredentials: credentials !== null,
      state: credentials === null ? CourierConnectionState.LoginRefused : row.state,
      connectedAt: row.createdAt,
      messages:
        row.unsignedAt !== null &&
        (row.lastMessageAt === null || row.unsignedAt > row.lastMessageAt)
          ? CourierMessagesState.TokenMissing
          : row.lastMessageAt !== null
            ? CourierMessagesState.Arriving
            : CourierMessagesState.NoneYet,
      lastMessageAt: row.lastMessageAt,
      messagesMissedAt:
        row.pasteWarnedAt !== null &&
        (row.lastMessageAt === null || row.lastMessageAt < row.pasteWarnedAt)
          ? row.pasteWarnedAt
          : null,
      pickupStore: credentials === null ? null : this.storeOf(row, credentials),
      retiring,
      suggestedKey: retiring ? platform.suggestedKey : null,
      backSince: retiring ? null : (back.get(row.id) ?? null),
      asksByOrderNumber: adapter.lookUp !== undefined,
    };
  }

  /** The saved login, or null when it can't be opened: shown as needing the login again (Slice 9.7). */
  private readableCredentials(row: SelectCourierConnection): Record<string, string> | null {
    try {
      return this.opened(row, row.tenantId).account.credentials;
    } catch (error) {
      if (error instanceof SecretUnreadable) return null;
      throw error;
    }
  }

  private storeOf(
    row: SelectCourierConnection,
    credentials: Record<string, string>,
  ): { id: string; name: string } | null {
    if (!this.adapterOf(row.courierKey).pickupStores) return null;
    const id = credentials[PICKUP_STORE_ID];
    return id ? { id, name: credentials[PICKUP_STORE_NAME] ?? '' } : null;
  }
}
