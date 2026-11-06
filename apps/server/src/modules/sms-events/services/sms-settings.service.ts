import { Inject, Injectable } from '@nestjs/common';
import type { SelectSmsSettings, SmsEventCounts } from '@lytronix/db';
import {
  renderSmsTemplate,
  SMS_EVENTS,
  SmsEvent,
  smsUnitsOf,
  smsWithName,
  takaFigure,
  type SmsRecipient,
  type SmsSettingsUpdateInput,
  type SmsVariable,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { fromPaisa, unitsTimesRate } from '../../balance/services/money';
import { trackingPageUrl } from '../../../common/shop-address';
import { usageCycleStart } from '../../../common/time';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { SmsUnits } from '../../sms-usage/services/sms-units';
import type { SmsEventStore } from '../ports/sms-event-store';
import { SMS_EVENT_STORE, SMS_EVENTS_CLOCK } from '../tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
/** SMS-12: the days an estimate counts back over. */
export const SMS_ESTIMATE_DAYS = 30;

/** SMS-10: what a template is counted with before any real order fills it: an order number and a tracking link of
 * their real lengths, and a typical amount and name. */
const SAMPLE: Readonly<Record<Exclude<SmsVariable, 'tracking_link'>, string>> = {
  order_number: '261106-0017',
  amount: '1,250',
  customer_name: 'রহিম উদ্দিন',
};
const SAMPLE_TRACKING_ID = 'AB3XK9QZ';

/** SMS-01's essential SMS, always on, in the platform's words (Slice 7.2's read): listed, never edited. */
export const ESSENTIAL_SMS = ['shopper_code', 'staff_reset_code', 'shop_ready'] as const;

/** SMS-12: one event's estimated cost: per order before the shop has any, else a month from its last 30 days. */
export type SmsEstimate =
  { basis: 'per_order'; cost: string } | { basis: 'last_30_days'; count: number; cost: string };

export interface SmsEventView {
  event: SmsEvent;
  recipient: SmsRecipient;
  on: boolean;
  template: string;
  /** SMS-19: false while it follows the platform's default. */
  edited: boolean;
  defaultTemplate: string;
  variables: readonly SmsVariable[];
  /** SMS-10: the template as the shop's next SMS would read, with sample values, and its units. */
  sample: string;
  units: number;
  estimate: SmsEstimate;
}

export interface SmsSettingsView {
  events: SmsEventView[];
  essentials: readonly string[];
  /** SMS-16: what every SMS starts with, and whether that is the shop's own name. */
  smsName: string;
  usesShopName: boolean;
  shopName: string;
  /** SMS-13: null for none; what the shop's SMS events have cost this month. */
  monthlySpendCap: string | null;
  spentThisMonth: string;
  unitSize: number;
  rate: string;
}

/**
 * SMS-02, SMS-03, SMS-10, SMS-12, SMS-13, SMS-16, SMS-19 (Slice 7.2, read agreed 2026-11-06): a shop's SMS events as
 * the owner sees and changes them. A shop that never changed anything has every default; only what it changed is
 * stored, so a reset follows the platform's current words.
 */
@Injectable()
export class SmsSettingsService {
  constructor(
    @Inject(SMS_EVENT_STORE) private readonly store: SmsEventStore,
    @Inject(SmsUnits) private readonly units: SmsUnits,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_EVENTS_CLOCK) private readonly clock: () => Date,
  ) {}

  async view(tenantId: string): Promise<SmsSettingsView> {
    const shop = await this.store.shop(tenantId);
    if (!shop) throw new ApiError('not_found', 'ShopNotFound', {});
    const now = this.clock();
    const [row, rates, counts, spent] = await Promise.all([
      this.store.settings(tenantId),
      this.units.current(),
      this.store.counts(tenantId, new Date(now.getTime() - SMS_ESTIMATE_DAYS * DAY_MS)),
      this.store.spentSince(tenantId, Object.values(SmsEvent), usageCycleStart(shop.cycle, now)),
    ]);
    const smsName = row?.smsName ?? shop.shopName;
    const link = trackingPageUrl(this.env, shop.slug, null, SAMPLE_TRACKING_ID);
    const events = Object.values(SmsEvent).map((event): SmsEventView => {
      const definition = SMS_EVENTS[event];
      const template = templateOf(row, event);
      const sample = smsWithName(
        smsName,
        renderSmsTemplate(template, { ...SAMPLE, tracking_link: link }),
      );
      const units = smsUnitsOf(sample, rates.unitSize);
      return {
        event,
        recipient: definition.recipient,
        on: isOn(row, event),
        template,
        edited: row?.templates[event] !== undefined,
        defaultTemplate: definition.template,
        variables: definition.variables,
        sample,
        units,
        estimate: estimateOf(event, counts, units, rates.rate),
      };
    });
    return {
      events,
      essentials: ESSENTIAL_SMS,
      smsName,
      usesShopName: row?.smsName == null,
      shopName: shop.shopName,
      monthlySpendCap: row?.monthlySpendCap ?? null,
      spentThisMonth: spent,
      unitSize: rates.unitSize,
      rate: rates.rate,
    };
  }

  async update(tenantId: string, input: SmsSettingsUpdateInput): Promise<SmsSettingsView> {
    await this.store.changeSettings(tenantId, {
      events: input.events,
      templates: input.templates,
      smsName: input.smsName,
      monthlySpendCap:
        input.monthlySpendCap === undefined
          ? undefined
          : input.monthlySpendCap === null
            ? null
            : input.monthlySpendCap.toFixed(2),
    });
    return this.view(tenantId);
  }

  /** SMS-19: the template goes back to the platform's current default. */
  async resetTemplate(tenantId: string, event: SmsEvent): Promise<SmsSettingsView> {
    await this.store.changeSettings(tenantId, { resetTemplates: [event] });
    return this.view(tenantId);
  }
}

/** SMS-02, SMS-03: the owner's switch, else the event's default. */
export function isOn(row: SelectSmsSettings | null, event: SmsEvent): boolean {
  return row?.events[event] ?? SMS_EVENTS[event].on;
}

/** SMS-19: the shop's own words, else the platform's default. */
export function templateOf(row: SelectSmsSettings | null, event: SmsEvent): string {
  return row?.templates[event] ?? SMS_EVENTS[event].template;
}

/** SMS-12: how many of the shop's last 30 days' orders would have sent this event. */
function countOf(event: SmsEvent, counts: SmsEventCounts): number {
  switch (event) {
    case SmsEvent.OrderPlaced:
      return counts.placed;
    case SmsEvent.PaymentVerified:
      return counts.paid;
    case SmsEvent.OrderShipped:
      return counts.shipped;
    case SmsEvent.OrderDelivered:
      return counts.delivered;
    case SmsEvent.OrderCancelled:
      return counts.cancelled;
    case SmsEvent.NewOrderAlert:
      return counts.fromOutside;
    case SmsEvent.PaymentToVerify:
      return counts.checkedByHand;
  }
}

/** SMS-12 (the read): per order while the shop has none, else the last 30 days' count at today's units and rate. */
function estimateOf(
  event: SmsEvent,
  counts: SmsEventCounts,
  units: number,
  rate: string,
): SmsEstimate {
  const perSms = unitsTimesRate(String(units), rate);
  if (!counts.anyOrder) return { basis: 'per_order', cost: takaFigure(fromPaisa(perSms)) };
  const count = countOf(event, counts);
  return {
    basis: 'last_30_days',
    count,
    cost: takaFigure(fromPaisa(perSms * BigInt(count))),
  };
}
