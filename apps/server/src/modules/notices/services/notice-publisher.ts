import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NoticeAudienceShop, SelectNotice } from '@lytronix/db';
import { NoticeSeverity, NotificationKind } from '@lytronix/validators';
import { LAPSED } from '../../identity/guards/dashboard.guard';
import { NOTIFICATION_LINKS } from '../../notifications/notification-words';
import { AccountNotices } from '../../notifications/services/account-notices';
import { Notifications } from '../../notifications/services/notifications';
import { noticeBellText, noticeMailWords } from '../notice-words';
import type { NoticeStore } from '../ports/notice-store';
import { NOTICE_STORE, NOTICES_CLOCK } from '../tokens';

/** The most notices one pass sends; the rest wait a minute. */
const DUE_PER_PASS = 20;
/** How many shops are read at a time while a notice is sent. */
const SHOPS_PER_BATCH = 200;

/**
 * NTC-06, NTC-11, NTC-13, D7-56 (Phase 7 Slice 7.4): each minute, the notices whose time has come are sent to every
 * shop in their audience -- the bell and push to the owner and the staff with `notices:read` (NTF-01), and for an
 * important or urgent one an email to the owner. Never an SMS, so no shop's balance moves. Each shop is told in its
 * own transaction with its delivery row, so a pass cut short carries on where it stopped and never tells a shop
 * twice; the notice is marked sent once every shop has been. Expiry needs no pass: a notice past its end time is
 * simply no longer read (NTC-11).
 */
@Injectable()
export class NoticePublisher {
  private readonly logger = new Logger('NoticePublisher');

  constructor(
    @Inject(NOTICE_STORE) private readonly store: NoticeStore,
    @Inject(NOTICES_CLOCK) private readonly clock: () => Date,
    @Inject(Notifications) private readonly notifications: Notifications,
    @Inject(AccountNotices) private readonly accountNotices: AccountNotices,
  ) {}

  /** One pass: how many notices were due, and how many shops were told. Safe to run twice at once. */
  async runTick(now: Date): Promise<{ notices: number; shops: number }> {
    const due = await this.store.due(now, DUE_PER_PASS);
    let shops = 0;
    for (const notice of due) {
      // One notice that can't be sent never holds up the others; it is tried again on the next pass.
      try {
        shops += await this.publish(notice, now);
      } catch (error) {
        this.logger.error(`notice ${notice.id} could not be sent`, error as Error);
      }
    }
    return { notices: due.length, shops };
  }

  private async publish(notice: SelectNotice, now: Date): Promise<number> {
    // RAT-09, NTC-13: the rate change now says which notice told of it.
    if (notice.rateChangeId !== null)
      await this.store.linkRateChange(notice.rateChangeId, notice.id);
    // Past its end before it could be sent (the server was down): it is on no board, so no one is told.
    if (notice.endsAt && notice.endsAt <= now) {
      await this.store.markSent(notice.id, this.clock());
      return 0;
    }
    let told = 0;
    let failed = 0;
    for (;;) {
      const shops = await this.store.audienceShops(notice, 'delivered', SHOPS_PER_BATCH);
      if (shops.length === 0) break;
      for (const shop of shops) {
        // NTC-08: withdrawn while going out, no one else hears of it; edited, the rest read it as it now stands.
        const current = await this.store.findById(notice.id);
        if (!current || current.withdrawnAt) return told;
        try {
          if (await this.deliver(current, shop)) told += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(
            `notice ${notice.id} could not reach shop ${shop.tenantId}`,
            error as Error,
          );
        }
      }
      // A shop that failed is still unsent, so it would come back in the next batch: the next pass tries it again.
      if (failed > 0) break;
    }
    if (failed === 0) await this.store.markSent(notice.id, this.clock());
    return told;
  }

  /** Tells one shop, or nothing when another pass already has. */
  private deliver(notice: SelectNotice, shop: NoticeAudienceShop): Promise<boolean> {
    const { tenantId } = shop;
    return this.store.runInShop(tenantId, async (tx) => {
      if (!(await this.store.claimDelivery(tx, notice.id, tenantId))) return false;
      const bell = noticeBellText(notice);
      const link = NOTIFICATION_LINKS.notice(notice.id);
      // NTC-07: in a lapsed or suspended shop only its owner can open a notice, so only the owner is told.
      const ownerOnly = LAPSED.has(shop.state) || shop.suspendedAt !== null;
      const result =
        notice.severity === NoticeSeverity.Info
          ? {
              people: await this.notifications.notifyWithin(tx, {
                tenantId,
                kind: NotificationKind.LytroNotice,
                text: bell,
                link,
                ownerOnly,
              }),
              emailed: false,
            }
          : await this.accountNotices.send(
              tx,
              tenantId,
              NotificationKind.LytroNotice,
              noticeMailWords(notice),
              link,
              bell,
              ownerOnly,
            );
      await this.store.finishDelivery(tx, notice.id, tenantId, result);
      return true;
    });
  }
}
