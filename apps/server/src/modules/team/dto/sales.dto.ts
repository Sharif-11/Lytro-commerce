import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SalesBucket, SalesRanking, StockUnit } from '@lytronix/validators';

const salesFigureSchema = z.object({
  orders: z.number(),
  units: z.array(z.object({ unit: z.nativeEnum(StockUnit), quantity: z.string() })),
  revenue: z.string(),
  tax: z.string(),
  deliveryCharges: z.string().nullable(),
  // INV-18, D3-9: only for a caller with inventory:manage.
  profit: z
    .object({
      revenueLessTax: z.string(),
      costOfGoods: z.string(),
      profit: z.string(),
      unknownCost: z.number(),
    })
    .optional(),
});

export const salesViewSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  bucket: z.nativeEnum(SalesBucket),
  productId: z.string().nullable(),
  buckets: z.array(salesFigureSchema.extend({ from: z.string(), to: z.string() })),
  totals: salesFigureSchema,
});
export class SalesViewDto extends createZodDto(salesViewSchema) {}

export const bestSellersViewSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  by: z.nativeEnum(SalesRanking),
  products: z.array(
    z.object({
      productId: z.string().nullable(),
      name: z.string(),
      stockUnit: z.nativeEnum(StockUnit),
      units: z.string(),
      revenue: z.string(),
      orders: z.number(),
    }),
  ),
});
export class BestSellersViewDto extends createZodDto(bestSellersViewSchema) {}
