import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  CourierNewsSource,
  RAW_MESSAGE_MAX_BYTES,
  RawMessageOutcome,
  TenantState,
  type CourierKey,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { SecretBox, SecretPurpose, SecretUnreadable } from '../../shared/secrets/secret-box';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { CourierNews, MessageHeaders } from '../ports/courier-adapter';
import type { CourierNotifier } from '../ports/courier-notifier';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_MESSAGE_ORIGIN, COURIER_NOTIFIER, COURIER_STORE } from '../tokens';
import { CourierRegistry } from './courier-registry';

const TOKEN_BYTES = 32;
// On the API host, where the server serves its public routes at /v1/... (API-14, public-api-host.ts).
const MESSAGE_PATH = '/v1/webhooks/couriers/';
// The owner hears at most this often that messages are arriving unsigned.
const UNSIGNED_NOTICE_EVERY_MS = 24 * 60 * 60 * 1000;
// DAT-51: the headers a courier's message is read by, kept with it; never a token or a signature.
const KEPT_HEADERS: readonly string[] = ['content-type', 'idempotency-key'];

/** DAT-51: of a message's headers, only those it is read by, each as one string. */
function keptHeaders(headers: MessageHeaders): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = headers[name];
    if (typeof value === 'string') kept[name] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') kept[name] = value[0];
  }
  return kept;
}

/** CRR-02: what a seller pastes into the courier's panel. */
export interface MessageAddress {
  address: string;
  token: string;
}

interface MessageSecrets {
  route: string;
  token: string;
}

/** What receiving a message came to: the news to apply, and whose. */
export interface Received {
  stored: string | null;
  tenantId: string | null;
  /** CRR-27: what this courier wants on the answer. */
  answerHeaders: Record<string, string>;
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function freshToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * CRR-02, CRR-03, CRR-11, CRR-13, CRR-20, CRR-27, LIF-13 (Phase 6 Slice 6.2, read agreed 2026-11-05): a courier's messages reaching a
 * shop. The address's token finds the shop before any tenant data is read or any adapter code runs, and an address that isn't
 * known is refused. Then the adapter checks the courier's own proof. A message that fails it changes nothing and is logged, and the
 * owner is told the token needs pasting, since the night check keeps orders moving meanwhile. A good one is stored and answered
 * at once, and applied afterwards, so a slow apply never looks like a failed delivery. A shop archived or deleted has its messages
 * logged and ignored. The address and token are made by Lytro and aren't the courier's credentials, so whoever manages couriers can
 * see them again, and replace them if one leaks.
 */
@Injectable()
export class CourierMessages {
  private readonly logger = new Logger('CourierMessages');

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(COURIER_NOTIFIER) private readonly notifier: CourierNotifier,
    @Inject(COURIER_MESSAGE_ORIGIN) private readonly origin: string,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** CRR-11: one message; `stored` is what to apply next, null when there's nothing to. */
  async receive(token: string, rawBody: Buffer, headers: MessageHeaders): Promise<Received> {
    const route = await this.store.findRoute(hashOf(token));
    if (!route) throw new ApiError('not_found', 'CourierAddressNotKnown', {});
    const { tenantId, courierKey } = route;
    const answerHeaders = this.registry.of(courierKey)?.messageAnswerHeaders?.() ?? {};
    // LIF-13: recorded through `locked`, and from `archived` logged and ignored.
    const shop = await this.shops.findById(tenantId);
    if (!shop || shop.state === TenantState.Archived || shop.state === TenantState.Deleted) {
      this.logger.warn(
        `a ${courierKey} message for a closed shop, tenant ${tenantId}, was ignored`,
      );
      return { stored: null, tenantId: null, answerHeaders };
    }
    const adapter = this.registry.of(courierKey);
    const connection = await this.store.run(tenantId, (tx) =>
      this.store.findConnection(tx, tenantId, courierKey),
    );
    if (!adapter || !connection?.messageSecrets) {
      throw new ApiError('not_found', 'CourierAddressNotKnown', {});
    }
    // CRR-27, read agreed 2026-11-05: answered at any good address, because it moves nothing and doesn't even count as a message arriving.
    if (adapter.isAddressTest?.(rawBody)) return { stored: null, tenantId: null, answerHeaders };
    // Slice 9.7: a pair that can no longer be opened is an address nobody knows, never a server fault.
    const secrets = this.readableSecrets(connection.messageSecrets, tenantId);
    if (!secrets) throw new ApiError('not_found', 'CourierAddressNotKnown', {});
    const now = this.clock();
    if (!adapter.verifyMessage(secrets.token, rawBody, headers)) {
      this.logger.warn(`a ${courierKey} message failed verification on tenant ${tenantId}`);
      await this.noteUnsigned(tenantId, connection.id, connection.unsignedAt, courierKey, now);
      throw new ApiError('unauthenticated', 'CourierMessageNotVerified', {});
    }
    // DAT-51, D9-16 (Phase 9 Slice 9.5): kept as it arrived, committed before it is read or answered, so neither a reading that
    // fails nor a failover between here and the answer loses it. An unreadable one stays for the operator (DAT-52).
    const rawId = await this.store.run(tenantId, (tx) =>
      this.store.keepRaw(tx, tenantId, {
        courierKey,
        body: rawBody.subarray(0, RAW_MESSAGE_MAX_BYTES).toString('utf8'),
        headers: keptHeaders(headers),
      }),
    );
    let news: CourierNews | null;
    try {
      news = adapter.readMessage(rawBody, headers);
    } catch {
      news = null;
    }
    const event = await this.store.run(tenantId, async (tx) => {
      await this.store.updateConnection(
        tx,
        tenantId,
        connection.id,
        // Phase 6 close-out: `unsignedAt` stays as the last bad message, so the once-a-day notice holds across a good one.
        { lastMessageAt: now },
        now,
      );
      const stored =
        news === null
          ? null
          : await this.storeNews(tx, tenantId, courierKey, news, CourierNewsSource.Message);
      await this.store.markRaw(
        tx,
        tenantId,
        rawId,
        news === null ? RawMessageOutcome.Unread : RawMessageOutcome.Read,
        stored,
      );
      return stored;
    });
    if (news === null) this.logger.warn(`a ${courierKey} message could not be read; it is kept`);
    return { stored: event, tenantId, answerHeaders };
  }

  /** CRR-13: news stored once; the id to apply, or null when it has come before. */
  async storeNews(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    news: CourierNews,
    source: CourierNewsSource,
  ): Promise<string | null> {
    const event = await this.store.insertEvent(tx, tenantId, {
      courierKey,
      source,
      dedupeKey: news.dedupeKey,
      rawStatus: news.rawStatus,
      reading: news.reading,
      messageEn: news.messageEn,
      messageBn: news.messageBn,
      happenedAt: news.happenedAt,
      news: {
        event: news.event,
        statusEvent: news.statusEvent,
        forShopper: news.forShopper,
        consignmentId: news.consignmentId,
        invoice: news.invoice,
        cashCollected: news.cashCollected,
        deliveryCharge: news.deliveryCharge,
        codAtCourier: news.codAtCourier,
        paid: news.paid,
        payoutId: news.payoutId,
      },
    });
    return event?.id ?? null;
  }

  /** CRR-02, CRR-03: the connection's address and token, made the first time they are asked for. */
  async addressOf(tenantId: string, courierKey: CourierKey): Promise<MessageAddress> {
    return this.store.run(tenantId, async (tx) => {
      const connection = await this.store.findConnection(tx, tenantId, courierKey);
      if (!connection) throw new ApiError('not_found', 'CourierNotConnected', {});
      const secrets = this.readableSecrets(connection.messageSecrets, tenantId);
      if (secrets) return this.addressFrom(secrets);
      return this.newPair(tx, tenantId, courierKey, connection.id);
    });
  }

  /** CRR-03: a new address and token; the old pair stops working at once, so both must be pasted again. */
  async replaceAddress(
    tenantId: string,
    courierKey: CourierKey,
    actor: CatalogueActor,
  ): Promise<MessageAddress> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const connection = await this.store.findConnection(tx, tenantId, courierKey);
      if (!connection) throw new ApiError('not_found', 'CourierNotConnected', {});
      const made = await this.newPair(tx, tenantId, courierKey, connection.id);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CourierAddressReplaced,
        { type: 'courier', id: connection.id },
        { courierKey },
      );
      return made;
    });
  }

  /** CRR-20: a disconnected courier's address is refused from now on. */
  forgetRoute(tx: Transaction, connectionId: string): Promise<void> {
    return this.store.deleteRoute(tx, connectionId);
  }

  /** Made once: the first connection of a courier, and on the first ask where an older connection has none. */
  makeIfMissing(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    connection: { id: string; messageSecrets: Buffer | null },
  ): Promise<MessageAddress> | MessageAddress {
    const secrets = this.readableSecrets(connection.messageSecrets, tenantId);
    return secrets
      ? this.addressFrom(secrets)
      : this.newPair(tx, tenantId, courierKey, connection.id);
  }

  private async newPair(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    connectionId: string,
  ): Promise<MessageAddress> {
    const secrets: MessageSecrets = { route: freshToken(), token: freshToken() };
    const now = this.clock();
    await this.store.updateConnection(
      tx,
      tenantId,
      connectionId,
      {
        messageSecrets: this.box.seal(
          JSON.stringify(secrets),
          SecretPurpose.CourierMessages,
          tenantId,
        ),
        unsignedAt: null,
      },
      now,
    );
    await this.store.replaceRoute(tx, {
      tokenHash: hashOf(secrets.route),
      tenantId,
      courierKey,
      connectionId,
    });
    return this.addressFrom(secrets);
  }

  /**
   * Slice 9.7: the sealed pair, or null where there's none or it can no longer be opened (the sealing key changed
   * without a re-seal). Such a pair is no use to anyone, so a new one is made the next time the address is asked for.
   */
  private readableSecrets(sealed: Buffer | null, tenantId: string): MessageSecrets | null {
    if (sealed === null) return null;
    try {
      return this.secretsFrom(sealed, tenantId);
    } catch (error) {
      if (!(error instanceof SecretUnreadable)) throw error;
      this.logger.warn(`a courier message pair on tenant ${tenantId} can't be opened`);
      return null;
    }
  }

  private secretsFrom(sealed: Buffer, tenantId: string): MessageSecrets {
    return JSON.parse(
      this.box.open(sealed, SecretPurpose.CourierMessages, tenantId),
    ) as MessageSecrets;
  }

  private addressFrom(secrets: MessageSecrets): MessageAddress {
    return { address: `${this.origin}${MESSAGE_PATH}${secrets.route}`, token: secrets.token };
  }

  /** Read agreed 2026-11-05: the connection shows it, and the owner hears at most once a day. */
  private async noteUnsigned(
    tenantId: string,
    connectionId: string,
    last: Date | null,
    courierKey: CourierKey,
    now: Date,
  ): Promise<void> {
    await this.store.run(tenantId, (tx) =>
      this.store.updateConnection(tx, tenantId, connectionId, { unsignedAt: now }, now),
    );
    if (last !== null && now.getTime() - last.getTime() < UNSIGNED_NOTICE_EVERY_MS) return;
    try {
      await this.notifier.connectionTrouble({ tenantId, courierKey, trouble: 'token_missing' });
    } catch (error) {
      this.logger.error('could not tell of a missing token', error as Error);
    }
  }
}
