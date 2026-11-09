import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OrderStatus, TenantState } from '@lytronix/validators';
import { SmsLogDto } from './sms.dto';
import { shopUsageSchema } from './usage-response.dto';

// ADM-03 (Phase 8 Slice 8.2): the operator's shop page, the figures it opens with and the lists behind them.
const sinceCountSchema = z.object({ since: z.date(), count: z.number().int() });

export const operatorShopFiguresSchema = z.object({
  balance: z.object({ amount: z.string(), frozen: z.boolean(), held: z.string() }),
  usage: shopUsageSchema.pick({ cycleStart: true, cycleEnd: true, metrics: true, payPerUse: true }),
  errors: sinceCountSchema,
  failedSms: z.object({
    since: z.date(),
    shop: z.object({ failed: z.number().int(), blocked: z.number().int() }),
    lytro: z.number().int(),
  }),
  failedCourierCalls: sinceCountSchema,
  signIns: z
    .object({
      userId: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
      isOwner: z.boolean(),
      lastAt: z.date().nullable(),
    })
    .array(),
  paymentsWaiting: z.object({
    lytro: z.object({ count: z.number().int(), amount: z.string() }),
    customers: z.number().int(),
  }),
  orders: z.record(z.nativeEnum(OrderStatus), z.number().int()),
});
export class OperatorShopFiguresDto extends createZodDto(operatorShopFiguresSchema) {}

// D8-23: what a kept fault shows the operator: its kind, where and its ID, never a message.
export const shopErrorPageSchema = z.object({
  errors: z
    .object({
      id: z.number().int(),
      requestId: z.string(),
      method: z.string(),
      route: z.string().nullable(),
      status: z.number().int(),
      kind: z.string(),
      createdAt: z.date(),
    })
    .array(),
  // The `before` that asks for the next page; null when this was the last.
  nextBefore: z.number().int().nullable(),
});
export class ShopErrorPageDto extends createZodDto(shopErrorPageSchema) {}

// ADM-03, D8-30: the SMS that didn't go -- the shop's own, without the customer's phone or the words, and Lytro's own.
const shopSmsSchema = SmsLogDto.schema.shape.sms.element.pick({
  id: true,
  kind: true,
  status: true,
  blockedReason: true,
  orderNumber: true,
  units: true,
  createdAt: true,
});

export const shopFailedSmsSchema = z.object({
  shop: shopSmsSchema.array(),
  lytro: z
    .object({
      id: z.number().int(),
      kind: z.string(),
      toPhone: z.string(),
      attempts: z.number().int(),
      lastError: z.string().nullable(),
      createdAt: z.date(),
    })
    .array(),
});
export class ShopFailedSmsDto extends createZodDto(shopFailedSmsSchema) {}

// ADM-04, D8-12 (Slice 8.3): where the extended period now ends, and whether a lapsed shop came back.
export class PlanExtensionDto extends createZodDto(
  z.object({
    periodEnd: z.date(),
    state: z.nativeEnum(TenantState),
    restored: z.boolean(),
  }),
) {}

// ADM-04, D8-5 (Slice 8.3): whether the phone the owner gave replaced the account's.
export class OwnerResetDoneDto extends createZodDto(z.object({ phoneChanged: z.boolean() })) {}
