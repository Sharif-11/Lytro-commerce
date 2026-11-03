import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import type { ListenerMessageRow, SelectListenerDevice } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  bdMobileNumber,
  LISTENER_BATCH_MAX,
  LISTENER_MESSAGE_MAX_LENGTH,
  LISTENER_RECEIVED_AHEAD_MINUTES,
  LISTENER_RECEIVED_OLDEST_DAYS,
  LISTENER_REQUEST_MAX_BYTES,
  LISTENER_TEXT_KEPT_DAYS,
  LISTENER_UNREAD_ALERT_PER_DAY,
  ListenerIgnoredReason,
  ListenerMessageStatus,
  PlatformActorType,
  PlatformAuditAction,
  type ListenerReceiptsQuery,
  type ListenerRecentQuery,
  type ListenerUploadInput,
} from '@lytronix/validators';
import { DAY_MS, dhakaDate, HOUR_MS, MINUTE_MS, startOfDayDhaka } from '../../../common/time';
import type { ListenerNotifier } from '../../listener/ports/listener-notifier';
import { ListenerLimits } from '../../listener/services/listener-limits';
import { ListenerRules } from '../../listener/services/listener-rules';
import { LISTENER_CLOCK, LISTENER_NOTIFIER } from '../../listener/tokens';
import type { ReceiptStore } from '../ports/receipt-store';
import { RECEIPT_STORE } from '../tokens';
import type {
  ListenerRecent,
  ListenerRecentItem,
  ListenerUnreadItem,
  ListenerUploadResult,
  ListenerUploaded,
  ReceiptPage,
} from '../types/listener-receipts';
import { maskedShapeOf, parseMessage, type ParsedMessage } from './receipt-parser';
import { ReceiptMatcher } from './receipt-matcher';

type UploadedMessage = ListenerUploadInput['messages'][number];

/**
 * LSN-04, LSN-13 to LSN-17, LSN-20, VER-06 (Phase 5 Slice 5.4b, read agreed 2026-11-02): what a phone forwards. Each
 * upload is limited ([30] a minute from a phone, [120] from a shop, [50] messages, [1,000] characters). Only a message
 * from Lytro's list of senders that reads as money reaching the account is kept with its text and goes on to be matched;
 * anything else verifies nothing and keeps no text -- what the wallet's own sender sent in wording the parser does not
 * know leaves only its masked shape, for Lytro. In test mode a message from an unknown sender that reads as a receipt is
 * kept, without its text, to show the phone reads it; it verifies nothing. A phone sending [500] messages an hour is
 * flagged to its owner and Lytro. Text is redacted at [90] days.
 */
@Injectable()
export class ListenerReceipts {
  private readonly logger = new Logger('ListenerReceipts');

  constructor(
    @Inject(RECEIPT_STORE) private readonly store: ReceiptStore,
    @Inject(ReceiptMatcher) private readonly matcher: ReceiptMatcher,
    @Inject(ListenerRules) private readonly rules: ListenerRules,
    @Inject(ListenerLimits) private readonly limits: ListenerLimits,
    @Inject(LISTENER_NOTIFIER) private readonly notifier: ListenerNotifier,
    @Inject(LISTENER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** LSN-13: a batch from a phone, each message answered in order; one that could not be taken is to be sent again. */
  async upload(
    device: SelectListenerDevice,
    appVersion: string,
    input: ListenerUploadInput,
  ): Promise<ListenerUploaded> {
    if (
      input.messages.length > LISTENER_BATCH_MAX ||
      input.messages.some((message) => message.text.length > LISTENER_MESSAGE_MAX_LENGTH) ||
      // Bangla runs to three bytes a character, so a full batch can pass this where its count does not.
      Buffer.byteLength(JSON.stringify(input)) > LISTENER_REQUEST_MAX_BYTES
    ) {
      throw new PayloadTooLargeException();
    }
    const now = this.clock();
    this.limits.admitUpload(device.id, device.tenantId, now);
    const senders = await this.rules.senders();
    const results: ListenerUploadResult[] = [];
    for (const message of input.messages) {
      results.push(await this.takeSafely(device, message, senders, now));
    }
    await this.store.run((tx) =>
      this.store.noteUploads(tx, device.id, {
        at: now,
        appVersion,
        day: dhakaDate(now),
        count: input.messages.length,
      }),
    );
    await this.watchVolume(device, input.messages.length, now);
    return { results, testModeUntil: this.rules.testModeOf(device, now) };
  }

  /** The app's home screen: this phone's newest receipts, and how today's stand. */
  async recent(device: SelectListenerDevice, query: ListenerRecentQuery): Promise<ListenerRecent> {
    const now = this.clock();
    return this.store.run(async (tx) => {
      const [rows, today] = [
        await this.store.recent(tx, device.tenantId, device.id, query.limit),
        await this.store.counts(tx, device.tenantId, device.id, startOfDayDhaka(now)),
      ];
      return { receipts: rows.map((row) => this.recentOf(row)), today };
    });
  }

  /** Agreed 2026-11-02 (Slice 5.4b read): the receipts staff can list and search; no notice is sent of them. */
  list(tenantId: string, query: ListenerReceiptsQuery): Promise<ReceiptPage> {
    const search =
      query.q !== undefined ? (bdMobileNumber(query.q) ?? query.q.toUpperCase()) : null;
    return this.store.run(async (tx) => {
      const found = await this.store.list(
        tx,
        tenantId,
        { status: query.status, search },
        { offset: (query.page - 1) * query.limit, limit: query.limit },
      );
      return {
        receipts: found.rows.map((row) => ({
          ...this.recentOf(row),
          senderNumber: row.senderNumber,
          deviceId: row.deviceId,
          text: row.rawText,
        })),
        page: query.page,
        limit: query.limit,
        total: found.total,
        pages: Math.ceil(found.total / query.limit),
      };
    });
  }

  /** VER-06 (amended 2026-11-02): the shapes of what could not be read lately, for Lytro. */
  async unread(days: number): Promise<ListenerUnreadItem[]> {
    const rows = await this.store.listUnread(
      dhakaDate(new Date(this.clock().getTime() - (days - 1) * DAY_MS)),
    );
    return rows.map((row) => ({ day: row.day, shape: row.shape, count: row.count }));
  }

  /**
   * LSN-17: each shop's receipt text past [90] days redacted, keeping the ID, amount, status and time; messages that verify
   * nothing, and the shapes, have no use past them. One shop's failure never stops the others. Safe to run again.
   */
  async redactOld(now: Date): Promise<{ redacted: number; removed: number }> {
    const before = new Date(now.getTime() - LISTENER_TEXT_KEPT_DAYS * DAY_MS);
    let redacted = 0;
    let removed = 0;
    for (const shopId of await this.store.listShopIds()) {
      try {
        const done = await this.store.run((tx) => this.store.redact(tx, shopId, before));
        redacted += done.redacted;
        removed += done.removed;
      } catch (error) {
        this.logger.error(`receipt redaction failed for tenant ${shopId}`, error as Error);
      }
    }
    await this.store.run((tx) => this.store.purgeUnread(tx, dhakaDate(before)));
    return { redacted, removed };
  }

  private recentOf(row: ListenerMessageRow): ListenerRecentItem {
    return {
      id: row.id,
      method: row.method,
      amount: row.amount,
      transactionId: row.transactionId,
      status: row.status,
      reviewReason: row.reviewReason,
      ignoredReason: row.ignoredReason,
      orderNumber: row.order?.orderNumber ?? null,
      receivedAt: row.receivedAt,
    };
  }

  /** LSN-13: one message that cannot be taken does not lose the batch: the app sends it again. Its text is never logged. */
  private async takeSafely(
    device: SelectListenerDevice,
    message: UploadedMessage,
    senders: readonly string[],
    now: Date,
  ): Promise<ListenerUploadResult> {
    try {
      return await this.take(device, message, senders, now);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      this.logger.error(`a message from phone ${device.id} could not be taken: ${name}`);
      return { status: null, transactionId: null, reviewReason: null, ignoredReason: null };
    }
  }

  private async take(
    device: SelectListenerDevice,
    message: UploadedMessage,
    senders: readonly string[],
    now: Date,
  ): Promise<ListenerUploadResult> {
    const parsed = parseMessage(message.text);
    const wanted = message.sender.toLowerCase();
    if (!senders.some((sender) => sender.toLowerCase() === wanted)) {
      // LSN-04: test mode shows the phone reads what looks like a receipt; it never verifies anything.
      return this.rules.testModeOf(device, now) !== null && parsed.kind === 'receipt'
        ? this.ignore(device, message, ListenerIgnoredReason.TestMode, parsed)
        : this.ignore(device, message, ListenerIgnoredReason.UnknownSender, null);
    }
    if (parsed.kind === 'not_receipt') {
      return this.ignore(device, message, ListenerIgnoredReason.NotReceipt, null);
    }
    if (parsed.kind === 'not_money_in') {
      return this.ignore(device, message, ListenerIgnoredReason.NotMoneyIn, null);
    }
    if (parsed.kind === 'unknown') {
      await this.keepShape(message.text, now);
      return this.ignore(device, message, ListenerIgnoredReason.UnknownFormat, null);
    }
    // LSN-15: a received time too far ahead or too old never verifies a payment.
    const received = message.receivedAt.getTime();
    if (received > now.getTime() + LISTENER_RECEIVED_AHEAD_MINUTES * MINUTE_MS) {
      return this.ignore(device, message, ListenerIgnoredReason.TooNew, parsed);
    }
    if (received < now.getTime() - LISTENER_RECEIVED_OLDEST_DAYS * DAY_MS) {
      return this.ignore(device, message, ListenerIgnoredReason.TooOld, parsed);
    }
    const row = await this.matcher.receive(
      device,
      {
        sender: message.sender,
        text: message.text,
        receivedAt: message.receivedAt,
        method: parsed.method,
        transactionId: parsed.transactionId,
        amount: parsed.amount,
        senderNumber: parsed.senderNumber,
      },
      now,
    );
    return {
      status: row.status,
      transactionId: row.transactionId,
      reviewReason: row.reviewReason,
      ignoredReason: null,
    };
  }

  /** VER-06, LSN-16: kept as verifying nothing, without its text. */
  private async ignore(
    device: SelectListenerDevice,
    message: UploadedMessage,
    reason: ListenerIgnoredReason,
    parsed: Extract<ParsedMessage, { kind: 'receipt' }> | null,
  ): Promise<ListenerUploadResult> {
    await this.store.run((tx) =>
      this.store.insert(tx, device.tenantId, {
        deviceId: device.id,
        sender: message.sender,
        method: parsed?.method ?? null,
        transactionId: parsed?.transactionId ?? null,
        amount: parsed?.amount ?? null,
        senderNumber: parsed?.senderNumber ?? null,
        rawText: null,
        status: ListenerMessageStatus.Ignored,
        ignoredReason: reason,
        receivedAt: message.receivedAt,
      }),
    );
    return {
      status: ListenerMessageStatus.Ignored,
      transactionId: parsed?.transactionId ?? null,
      reviewReason: null,
      ignoredReason: reason,
    };
  }

  /** VER-06 (amended 2026-11-02): the masked shape counted; the day's [20]th tells Lytro, once. */
  private async keepShape(text: string, now: Date): Promise<void> {
    const shape = maskedShapeOf(text);
    const day = dhakaDate(now);
    const total = await this.store.run((tx) =>
      this.store.addUnread(tx, {
        day,
        shape,
        shapeHash: createHash('sha256').update(shape).digest('hex'),
      }),
    );
    if (total !== LISTENER_UNREAD_ALERT_PER_DAY) return;
    await this.notifier.unreadMessages({ day, total }).catch((error: unknown) => {
      this.logger.error(`could not tell Lytro of unreadable messages: ${String(error)}`);
    });
  }

  /** LSN-14: past [500] messages in an hour the phone is flagged to its owner and Lytro -- once, however long it goes on. */
  private async watchVolume(device: SelectListenerDevice, count: number, now: Date): Promise<void> {
    if (!this.limits.overVolume(device.id, count, now)) return;
    const flagged = await this.store.run(async (tx) => {
      if (!(await this.store.flagVolume(tx, device.id, now, new Date(now.getTime() - HOUR_MS)))) {
        return false;
      }
      await this.rules.recordBoth(tx, {
        tenantId: device.tenantId,
        actor: { id: null, ip: null, type: ActorType.System },
        platformActor: { type: PlatformActorType.System, id: null },
        action: AuditAction.ListenerVolumeFlagged,
        platformAction: PlatformAuditAction.ListenerVolumeFlagged,
        deviceId: device.id,
        summary: { name: device.name },
      });
      return true;
    });
    if (!flagged) return;
    await this.notifier
      .volumeFlagged({ tenantId: device.tenantId, deviceId: device.id, name: device.name })
      .catch((error: unknown) => {
        this.logger.error(`could not tell of a phone's volume: ${String(error)}`);
      });
  }
}
