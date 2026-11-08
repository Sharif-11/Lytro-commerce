import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OrderStatus } from '@lytronix/validators';

// ADM-03 (Phase 8 Slice 8.2): the operator's shop page, the figures it opens with and the lists behind them.
const sinceCountSchema = z.object({ since: z.date(), count: z.number().int() });

export const operatorShopFiguresSchema = z.object({
  balance: z.object({ amount: z.string(), frozen: z.boolean(), held: z.string() }),
  errors: sinceCountSchema,
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
