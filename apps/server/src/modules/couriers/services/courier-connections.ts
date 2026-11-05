import { Inject, Injectable } from '@nestjs/common';
import type { SelectCourierConnection, Transaction } from '@lytronix/db';
import {
  AuditAction,
  CourierCallAction,
  CourierConnectionState,
  FieldProblemCode,
  type ConnectCourierInput,
  type CourierKey,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { CircuitOpen } from '../../../common/circuit-breaker';
import { SlidingWindow } from '../../../common/sliding-window';
import { MINUTE_MS } from '../../../common/time';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { SecretBox, SecretPurpose } from '../../shared/secrets/secret-box';
import {
  CourierNoAnswer,
  type CourierAccount,
  type CourierAdapter,
} from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_STORE } from '../tokens';
import { CourierCalls } from './courier-calls';
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
  takesWeight: boolean;
  /** D6-8: it can be cancelled from Lytro; otherwise staff confirm they did it in its panel. */
  canCancel: boolean;
}

/** CRR-03: a connection as anyone sees it: whether it has credentials, never what they are. */
export interface CourierConnectionView {
  courierKey: CourierKey;
  name: string;
  isDefault: boolean;
  hasCredentials: true;
  state: CourierConnectionState;
  connectedAt: Date;
}

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
  private readonly failures = new SlidingWindow(CONNECT_WINDOW_MS);

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** CRR-01. */
  adapters(): CourierAdapterView[] {
    return this.registry.all().map((adapter) => ({
      key: adapter.key,
      name: adapter.name,
      credentialFields: [...adapter.credentialFields],
      needsArea: adapter.needsArea,
      takesWeight: adapter.limits.weightKg !== null,
      canCancel: adapter.cancel !== undefined,
    }));
  }

  async list(tenantId: string): Promise<CourierConnectionView[]> {
    const rows = await this.store.run(tenantId, (tx) => this.store.listConnections(tx, tenantId));
    return rows.map((row) => this.viewOf(row));
  }

  /** CRR-02, CRR-03, CRR-04: connects a courier, or replaces its credentials. Refused credentials save nothing. */
  async connect(
    tenantId: string,
    input: ConnectCourierInput,
    actor: CatalogueActor,
  ): Promise<CourierConnectionView> {
    const adapter = this.adapterOf(input.courierKey);
    const who = await this.activity.resolve(tenantId, actor);
    const saved = await this.store.run(tenantId, (tx) =>
      this.store.findConnection(tx, tenantId, input.courierKey),
    );
    const credentials = this.credentialsOf(adapter, input, saved, tenantId);
    const bucket = `${tenantId}:${adapter.key}`;
    const now = this.clock();
    if (!this.failures.peek(bucket, CONNECT_FAILURES, now.getTime()).allowed) {
      throw new ApiError(
        'rate_limited',
        'CourierConnectTooManyTries',
        {},
        CONNECT_WINDOW_MS / 1000,
      );
    }
    await this.tryCredentials(adapter, tenantId, saved?.id ?? null, credentials, bucket, now);

    return this.store.run(tenantId, async (tx) => {
      const others = await this.store.listConnections(tx, tenantId);
      const row = await this.store.saveConnection(
        tx,
        tenantId,
        {
          courierKey: adapter.key,
          credentials: this.box.seal(
            JSON.stringify(credentials),
            SecretPurpose.CourierCredentials,
            tenantId,
          ),
          isDefault: others.length === 0,
          state: CourierConnectionState.Active,
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
      return this.viewOf(row);
    });
  }

  /** CRR-20: its credentials go; its parcels stay. If it was the default, the oldest other connection takes over. */
  async disconnect(tenantId: string, courierKey: CourierKey, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(tenantId, async (tx) => {
      const row = await this.store.deleteConnection(tx, tenantId, courierKey);
      if (!row) throw new ApiError('not_found', 'CourierNotConnected', {});
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
      return this.viewOf(row);
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

  /** LIF-19: the day-60 deletion's couriers step. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.deleteAllForTenant(tenantId);
  }

  /** SEC-11: the shop's log of its courier credentials' uses, for the operator. */
  async uses(tenantId: string, page: number, limit: number) {
    const found = await this.store.listUses(tenantId, { offset: (page - 1) * limit, limit });
    return {
      uses: found.rows.map((row) => ({
        courierKey: row.courierKey,
        action: row.action,
        connectionId: row.connectionId,
        orderId: row.orderId,
        succeeded: row.succeeded,
        at: row.at,
      })),
      page,
      limit,
      total: found.total,
      pages: Math.ceil(found.total / limit),
    };
  }

  private async tryCredentials(
    adapter: CourierAdapter,
    tenantId: string,
    connectionId: string | null,
    credentials: Record<string, string>,
    bucket: string,
    now: Date,
  ): Promise<void> {
    const account = { tenantId, connectionId: connectionId ?? '', credentials };
    try {
      const answer = await this.calls.run(
        adapter,
        { tenantId, connectionId, orderId: null, action: CourierCallAction.Test },
        () => adapter.testConnection(account),
      );
      if (answer.outcome === 'accepted') return;
      this.failures.take(bucket, CONNECT_FAILURES, now.getTime());
      const { message } = answer.refusal;
      throw new ApiError(
        'conflict',
        message === null ? 'CourierRefusedKeysNoReason' : 'CourierRefusedKeys',
        { courierKey: adapter.key, courierMessage: message },
        undefined,
        { courier: adapter.name, message: message ?? '' },
      );
    } catch (error) {
      if (error instanceof CircuitOpen || error instanceof CourierNoAnswer) {
        throw new ApiError(
          'service_unavailable',
          'CourierNotAnswering',
          { courierKey: adapter.key },
          RETRY_AFTER_SECONDS,
          { courier: adapter.name },
        );
      }
      throw error;
    }
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

  private viewOf(row: SelectCourierConnection): CourierConnectionView {
    return {
      courierKey: row.courierKey,
      name: this.adapterOf(row.courierKey).name,
      isDefault: row.isDefault,
      hasCredentials: true,
      state: row.state,
      connectedAt: row.createdAt,
    };
  }
}
