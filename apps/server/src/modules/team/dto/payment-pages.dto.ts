import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  newShopCapSchema,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  paymentPageReportListSchema,
} from '@lytronix/validators';

// ADM-12 (Phase 5 Slice 5.2b): the operator's queue of payment page reports.
export class PaymentPageReportQueryDto extends createZodDto(paymentPageReportListSchema) {}
// TVR-04 (Slice 5.3): the operator's switch for one shop's new-shop cap.
export class NewShopCapDto extends createZodDto(newShopCapSchema) {}
export class PaymentPageReportListDto extends createZodDto(
  z.object({
    reports: z.array(
      z.object({
        id: z.string(),
        shop: z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          paymentPageSuspended: z.boolean(),
        }),
        paymentUrl: z.string(),
        reason: z.nativeEnum(PaymentPageReportReason),
        note: z.string().nullable(),
        ip: z.string().nullable(),
        status: z.nativeEnum(PaymentPageReportStatus),
        createdAt: z.coerce.date(),
        handledAt: z.coerce.date().nullable(),
      }),
    ),
  }),
) {}
