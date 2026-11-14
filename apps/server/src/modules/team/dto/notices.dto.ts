import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  NoticeCategory,
  noticeAudienceSchema,
  noticeCreateSchema,
  noticeReachSchema,
  NoticeSeverity,
  NoticeStatus,
  noticesQuerySchema,
  noticeTemplateSchema,
  noticeUpdateSchema,
} from '@lytronix/validators';

// NTC-01 to NTC-18 (Phase 7 Slice 7.4): the board, the operator's desk and the templates, each request shape written once.
export class NoticesQueryDto extends createZodDto(noticesQuerySchema) {}
export class NoticeCreateDto extends createZodDto(noticeCreateSchema) {}
export class NoticeUpdateDto extends createZodDto(noticeUpdateSchema) {}
export class NoticeTemplateDto extends createZodDto(noticeTemplateSchema) {}
export class NoticeReachDto extends createZodDto(noticeReachSchema) {}

const category = z.nativeEnum(NoticeCategory);
const severity = z.nativeEnum(NoticeSeverity);

const noticeViewSchema = z.object({
  id: z.string(),
  category,
  severity,
  title: z.string(),
  // As the operator typed it, in the few marks D7-53 allows.
  body: z.string(),
  // NTC-16: the same body as safe HTML -- every character escaped, then bold, https links and lists only.
  html: z.string(),
  language: z.enum(['bn', 'en']),
  pinned: z.boolean(),
  requiresAck: z.boolean(),
  acknowledgedAt: z.date().nullable(),
  publishedAt: z.date(),
  endsAt: z.date().nullable(),
  editedAt: z.date().nullable(),
  windowStartsAt: z.date().nullable(),
  windowEndsAt: z.date().nullable(),
  read: z.boolean(),
});

export class NoticeViewDto extends createZodDto(noticeViewSchema) {}

export class NoticeBoardPageDto extends createZodDto(
  z.object({
    items: z.array(noticeViewSchema),
    unread: z.number().int(),
    next: z.number().int().nullable(),
  }),
) {}

const noticeBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  category,
  severity,
  publishedAt: z.date(),
});

export class NoticeSummaryDto extends createZodDto(
  z.object({
    unread: z.number().int(),
    banners: z.array(noticeBriefSchema),
    prompts: z.array(noticeBriefSchema),
    toAcknowledge: z.array(noticeBriefSchema),
    maintenance: z
      .object({
        id: z.string(),
        title: z.string(),
        startsAt: z.date(),
        endsAt: z.date(),
        underWay: z.boolean(),
      })
      .nullable(),
    // Slice 9.9 (D9-14, D9-25): the dashboard's two banners -- degraded mode is on; saving is paused (DAT-42).
    limitedMode: z.boolean(),
    savingPaused: z.boolean(),
  }),
) {}

export class NoticeUnreadDto extends createZodDto(z.object({ unread: z.number().int() })) {}

export class NoticeAcknowledgedDto extends createZodDto(z.object({ acknowledgedAt: z.date() })) {}

const countsSchema = z.object({
  shops: z.number().int(),
  people: z.number().int(),
  reads: z.number().int(),
  acknowledged: z.number().int(),
});

const operatorNoticeSchema = z.object({
  id: z.string(),
  titleBn: z.string().nullable(),
  titleEn: z.string().nullable(),
  bodyBn: z.string().nullable(),
  bodyEn: z.string().nullable(),
  htmlBn: z.string().nullable(),
  htmlEn: z.string().nullable(),
  category,
  severity,
  audience: noticeAudienceSchema,
  publishAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  pinned: z.boolean(),
  requiresAck: z.boolean(),
  windowStartsAt: z.date().nullable(),
  windowEndsAt: z.date().nullable(),
  rateChangeId: z.number().int().nullable(),
  status: z.nativeEnum(NoticeStatus),
  createdBy: z.string(),
  createdAt: z.date(),
  editedAt: z.date().nullable(),
  withdrawnAt: z.date().nullable(),
  sentAt: z.date().nullable(),
  counts: countsSchema,
});

export class OperatorNoticeDto extends createZodDto(operatorNoticeSchema) {}

export class OperatorNoticePageDto extends createZodDto(
  z.object({ items: z.array(operatorNoticeSchema), next: z.number().int().nullable() }),
) {}

export class OperatorNoticeDetailDto extends createZodDto(
  operatorNoticeSchema.extend({
    createdByEmail: z.string().nullable(),
    versions: z.array(
      z.object({
        editedBy: z.string(),
        editedByEmail: z.string().nullable(),
        replacedAt: z.date(),
        snapshot: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
) {}

const noticeShopSchema = z.object({ tenantId: z.string(), slug: z.string(), shopName: z.string() });

export class NoticeAcknowledgmentListDto extends createZodDto(
  z.object({
    acknowledged: z.array(
      noticeShopSchema.extend({ userId: z.string(), acknowledgedAt: z.date() }),
    ),
    pending: z.array(noticeShopSchema),
    acknowledgedCount: z.number().int(),
    pendingCount: z.number().int(),
  }),
) {}

export class NoticeReachedDto extends createZodDto(z.object({ shops: z.number().int() })) {}

export class NoticeDraftDto extends createZodDto(
  z.object({
    titleBn: z.string(),
    titleEn: z.string(),
    bodyBn: z.string(),
    bodyEn: z.string(),
    category,
    severity,
    requiresAck: z.boolean(),
    windowStartsAt: z.date().nullable(),
    windowEndsAt: z.date().nullable(),
    rateChangeId: z.number().int().nullable(),
  }),
) {}
