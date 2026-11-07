import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FulfilmentType,
  LedgerEntryType,
  OrderSource,
  renderSmsTemplate,
  SMS_EVENTS,
  SmsBlockedReason,
  SmsEvent,
  SmsLogStatus,
  smsWithName,
  takaFigure,
  UsageMetric,
} from '@lytronix/validators';
import type { SelectSmsSettings } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { trackingPageUrl } from '../../../common/shop-address';
import { usageCycleStart } from '../../../common/time';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa, unitsTimesRate } from '../../balance/services/money';
import { ShopStorefrontService } from '../../balance/services/shop-storefront.service';
import { DomainService } from '../../domains/services/domain.service';
import { SmsRefused } from '../../shared/messaging/providers/bulksmsbd.provider';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { SmsLog } from '../../sms-usage/services/sms-log';
import { SmsUnits } from '../../sms-usage/services/sms-units';
import { StaffService } from '../../staff/services/staff.service';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import type { SmsEventStore, SmsOrderFacts, SmsShop } from '../ports/sms-event-store';
import { SMS_EVENT_STORE, SMS_EVENTS_CLOCK } from '../tokens';
import type { SmsEventJob } from './sms-event-queue';
import { isOn, templateOf } from './sms-settings.service';

// SMS-08: how often, and from how far apart (backing off), a failed SMS event is tried again.
export const SMS_EVENT_RETRIES = 3;
export const SMS_EVENT_RETRY_DELAY_SECONDS = 60;

/** SMS-13: the share of the spend cap the owner is warned at (the read: 80%, by email). */
const SPEND_CAP_SHARES = [80] as const;

/** One SMS ready to charge and send. */
interface Prepared {
  event: SmsEvent;
  orderId: string;
  toPhone: string;
  body: string;
  units: number;
  rate: string;
  cost: string;
}

/** Thrown to have the job try again later, once the failed try is logged and given back. */
export class SmsEventSendFailed extends Error {
  constructor(event: SmsEvent, cause: unknown) {
    super(`SMS event ${event} not sent: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SmsEventSendFailed';
  }
}

/**
 * SMS-01 to SMS-08, SMS-13, SMS-15, SMS-16 (Slice 7.2, read agreed 2026-11-06): sends what one of an order's events
 * should, from its job, apart from the order. For each event the shop has on: the shopper's SMS for a delivery order
 * with a phone, the owner's for an order from outside or a payment to check; worded from the shop's template after its
 * SMS name; refused at the month's spend cap; charged from the balance at the SMS rate, never below zero, in the
 * transaction that decides to send it (D7-23); given back if the send fails (SMS-08). Every outcome is logged.
 */
@Injectable()
export class SmsEventSender {
  private readonly logger = new Logger('SmsEvents');

  constructor(
    @Inject(SMS_EVENT_STORE) private readonly store: SmsEventStore,
    @Inject(SmsUnits) private readonly units: SmsUnits,
    @Inject(SmsLog) private readonly log: SmsLog,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService,
    @Inject(DomainService) private readonly domains: DomainService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_EVENTS_CLOCK) private readonly clock: () => Date,
  ) {}

  async send(job: SmsEventJob): Promise<void> {
    const [settings, shop, order] = await Promise.all([
      this.store.settings(job.tenantId),
      this.store.shop(job.tenantId),
      this.store.order(job.tenantId, job.orderId),
    ]);
    if (!shop || !order) return;
    let failed: SmsEventSendFailed | null = null;
    for (const event of job.events) {
      if (!isOn(settings, event)) continue;
      const prepared = await this.prepare(event, job, settings, shop, order);
      if (!prepared) continue;
      try {
        await this.chargeAndSend(job, shop, settings, prepared);
      } catch (error) {
        if (!(error instanceof SmsEventSendFailed)) throw error;
        failed = error;
      }
    }
    if (failed) throw failed;
  }

  /** Who it goes to and what it says, or nothing when this order has no one to send it to. */
  private async prepare(
    event: SmsEvent,
    job: SmsEventJob,
    settings: SelectSmsSettings | null,
    shop: SmsShop,
    order: SmsOrderFacts,
  ): Promise<Prepared | null> {
    const toPhone = await this.recipientOf(event, job.tenantId, order);
    if (toPhone === null) return null;
    const body = smsWithName(
      settings?.smsName ?? shop.shopName,
      renderSmsTemplate(templateOf(settings, event), {
        order_number: order.orderNumber,
        amount: takaFigure(job.amount ?? order.grandTotal),
        customer_name: order.customerName ?? '',
        tracking_link:
          event === SmsEvent.OrderShipped ? await this.trackingOf(job.tenantId, shop, order) : '',
      }),
    );
    const { units, rate } = await this.units.priceOf(body);
    return {
      event,
      orderId: order.id,
      toPhone,
      body,
      units,
      rate,
      // BAL-16: what the balance service charges for these units at this rate, worked out the same way.
      cost: fromPaisa(unitsTimesRate(String(units), rate)),
    };
  }

  /**
   * The read: a shopper's SMS only for a delivery order with a phone, from any source; the new-order alert only for an
   * order the shop didn't enter itself; the owner's two at the owner's own phone.
   */
  private async recipientOf(
    event: SmsEvent,
    tenantId: string,
    order: SmsOrderFacts,
  ): Promise<string | null> {
    if (SMS_EVENTS[event].recipient === 'owner') {
      if (event === SmsEvent.NewOrderAlert && order.source === OrderSource.Dashboard) return null;
      return (await this.staff.ownerContact(tenantId))?.phone ?? null;
    }
    if (order.fulfilmentType !== FulfilmentType.Delivery || order.customerErased) return null;
    return order.customerPhone;
  }

  /** The read: the order's tracking page on the shop's storefront; with none, the courier's own link, else its code. */
  private async trackingOf(tenantId: string, shop: SmsShop, order: SmsOrderFacts): Promise<string> {
    if (await this.storefront.isOn(tenantId)) {
      const host = await this.domains.servingHost(tenantId);
      return trackingPageUrl(this.env, shop.slug, host, order.trackingId);
    }
    return order.trackingLink ?? order.trackingCode ?? '';
  }

  private async chargeAndSend(
    job: SmsEventJob,
    shop: SmsShop,
    settings: SelectSmsSettings | null,
    sms: Prepared,
  ): Promise<void> {
    const logged = (
      status: SmsLogStatus,
      cost: string,
      more: { blockedReason?: SmsBlockedReason; providerMessageId?: string | null } = {},
    ) =>
      this.log.record({
        tenantId: job.tenantId,
        kind: sms.event,
        toPhone: sms.toPhone,
        units: sms.units,
        cost,
        isEssential: false,
        status,
        orderId: job.orderId,
        body: sms.body,
        ...more,
      });

    const charged = await this.charge(job.tenantId, shop, settings, sms);
    if ('blocked' in charged) {
      await logged(SmsLogStatus.Blocked, '0', { blockedReason: charged.blocked });
      return;
    }
    try {
      const sent = await this.messaging.sendNow({ toPhone: sms.toPhone, body: sms.body });
      await logged(SmsLogStatus.Sent, sms.cost, { providerMessageId: sent.providerMessageId });
    } catch (error) {
      // SMS-08: a failed SMS costs nothing; a later try charges again only if it goes out.
      if (charged.chargeId !== null) {
        await this.store.run(job.tenantId, (tx) =>
          this.balance.credit(tx, {
            tenantId: job.tenantId,
            type: LedgerEntryType.Reversal,
            amount: sms.cost,
            reference: { reverses: charged.chargeId, reason: 'sms_not_sent' },
          }),
        );
      }
      await logged(SmsLogStatus.Failed, '0');
      this.logger.warn(
        `SMS event ${sms.event} for order ${job.orderId} of tenant ${job.tenantId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // BulkSMSBD's own "no" (a wrong number, say) won't change on a second try.
      if (!(error instanceof SmsRefused)) throw new SmsEventSendFailed(sms.event, error);
    }
  }

  /**
   * SMS-13: refused at the month's cap. D7-23, SMS-06, SMS-15: charged at the SMS rate, never below zero; a lapsed
   * shop's frozen balance refuses it. The 80% warning is queued in the same transaction.
   */
  private async charge(
    tenantId: string,
    shop: SmsShop,
    settings: SelectSmsSettings | null,
    sms: Prepared,
  ): Promise<{ chargeId: number | null } | { blocked: SmsBlockedReason }> {
    const cap = settings?.monthlySpendCap ?? null;
    let spent = '0';
    if (cap !== null) {
      spent = await this.store.spentSince(
        tenantId,
        Object.values(SmsEvent),
        usageCycleStart(shop.cycle, this.clock()),
      );
      if (toPaisa(spent) + toPaisa(sms.cost) > toPaisa(cap)) {
        return { blocked: SmsBlockedReason.SpendCap };
      }
    }
    if (Number(sms.rate) <= 0) return { chargeId: null };
    try {
      return await this.store.run(tenantId, async (tx) => {
        const entry = await this.balance.charge(tx, {
          tenantId,
          type: LedgerEntryType.Sms,
          units: String(sms.units),
          rateUsed: sms.rate,
          reference: { kind: sms.event, orderId: sms.orderId },
        });
        if (cap !== null) {
          await this.warnings.check(tx, {
            tenantId,
            metric: UsageMetric.SmsSpend,
            used: Number(fromPaisa(toPaisa(spent) + toPaisa(sms.cost))),
            limit: Number(cap),
            shares: SPEND_CAP_SHARES,
          });
        }
        return { chargeId: entry.id };
      });
    } catch (error) {
      if (error instanceof ApiError && error.messageKey === 'InsufficientBalance') {
        return { blocked: SmsBlockedReason.InsufficientBalance };
      }
      if (error instanceof ApiError && error.messageKey === 'BalanceFrozen') {
        return { blocked: SmsBlockedReason.BalanceFrozen };
      }
      throw error;
    }
  }
}
