import { z } from 'zod';
import { isNoticeLinkTarget, noticeLinksIn } from '../../common/notice-markdown';
import {
  NoticeAudienceKind,
  NoticeCategory,
  NoticeSeverity,
  NoticeTemplate,
  RateKey,
  TenantState,
} from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

/** NTC-01: a notice's title, at most 120 characters in each language. */
export const NOTICE_TITLE_MAX = 120;
/** NTC-01: a notice's body, at most 5,000 characters in each language. */
export const NOTICE_BODY_MAX = 5000;
/** NTC-03: the board keeps the last 24 months. */
export const NOTICE_KEPT_MONTHS = 24;
/** NTC-03: the most notices one page of the board holds. */
export const NOTICES_PAGE_MAX = 50;

/** NTC-02: who a notice is for -- every shop, those on chosen plans, those in chosen states, or one shop. */
export const noticeAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(NoticeAudienceKind.All) }).strict(),
  z
    .object({
      kind: z.literal(NoticeAudienceKind.Plans),
      planIds: z.array(z.string().uuid()).min(1).max(50),
    })
    .strict(),
  z
    .object({
      kind: z.literal(NoticeAudienceKind.States),
      states: z.array(z.nativeEnum(TenantState)).min(1).max(Object.values(TenantState).length),
    })
    .strict(),
  z.object({ kind: z.literal(NoticeAudienceKind.Tenant), tenantId: z.string().uuid() }).strict(),
]);
export type NoticeAudience = z.infer<typeof noticeAudienceSchema>;

const title = z.string().trim().min(1).max(NOTICE_TITLE_MAX);
const body = z.string().trim().min(1).max(NOTICE_BODY_MAX);

const noticeShape = {
  titleBn: title.nullable().optional(),
  titleEn: title.nullable().optional(),
  bodyBn: body.nullable().optional(),
  bodyEn: body.nullable().optional(),
  category: z.nativeEnum(NoticeCategory),
  severity: z.nativeEnum(NoticeSeverity),
  audience: noticeAudienceSchema,
  // NTC-01, NTC-11: when it goes live; left out, the notice is a draft.
  publishAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  pinned: z.boolean().optional(),
  // NTC-05: the owner must click "I understand".
  requiresAck: z.boolean().optional(),
  // NTC-14, D7-55: a maintenance window, which the dashboard counts down to.
  windowStartsAt: z.coerce.date().nullable().optional(),
  windowEndsAt: z.coerce.date().nullable().optional(),
  // NTC-13: the rate change this notice tells of (control.rate_history's ID), linked when it is published.
  rateChangeId: z.number().int().positive().nullable().optional(),
};

/** The parts of a notice its rules read, whole: a new one, or an edit laid over the one it changes. */
export interface NoticeContent {
  titleBn?: string | null | undefined;
  titleEn?: string | null | undefined;
  bodyBn?: string | null | undefined;
  bodyEn?: string | null | undefined;
  category: NoticeCategory;
  publishAt?: Date | null | undefined;
  endsAt?: Date | null | undefined;
  windowStartsAt?: Date | null | undefined;
  windowEndsAt?: Date | null | undefined;
}

/** One rule a notice breaks: the field, and the problem a person reads. */
export interface NoticeProblem {
  path: (string | number)[];
  problem: FieldProblemCode;
}

/**
 * NTC-01, NTC-14, NTC-15, NTC-16: what a whole notice must be. At least one language has both a title and a body (the
 * board falls back to it), and a language with one has the other; every link is https; it ends after it starts; and a
 * maintenance window has both ends, the end after the start, on a maintenance notice only.
 */
export function noticeProblems(notice: NoticeContent): NoticeProblem[] {
  const problems: NoticeProblem[] = [];
  const has = (value: string | null | undefined): boolean => Boolean(value?.trim());
  for (const [titleKey, bodyKey] of [
    ['titleBn', 'bodyBn'],
    ['titleEn', 'bodyEn'],
  ] as const) {
    if (has(notice[titleKey]) && !has(notice[bodyKey])) {
      problems.push({ path: [bodyKey], problem: FieldProblemCode.Required });
    }
    if (has(notice[bodyKey]) && !has(notice[titleKey])) {
      problems.push({ path: [titleKey], problem: FieldProblemCode.Required });
    }
  }
  if (!has(notice.titleBn) && !has(notice.titleEn)) {
    problems.push({ path: ['titleBn'], problem: FieldProblemCode.Required });
  }
  for (const key of ['bodyBn', 'bodyEn'] as const) {
    const text = notice[key];
    if (text && noticeLinksIn(text).some((target) => !isNoticeLinkTarget(target))) {
      problems.push({ path: [key], problem: FieldProblemCode.NotAllowed });
    }
  }
  if (notice.publishAt && notice.endsAt && notice.endsAt <= notice.publishAt) {
    problems.push({ path: ['endsAt'], problem: FieldProblemCode.TooSmall });
  }
  const start = notice.windowStartsAt;
  const end = notice.windowEndsAt;
  if ((start ? 1 : 0) + (end ? 1 : 0) === 1) {
    problems.push({
      path: [start ? 'windowEndsAt' : 'windowStartsAt'],
      problem: FieldProblemCode.Required,
    });
  }
  if (start && end && end <= start) {
    problems.push({ path: ['windowEndsAt'], problem: FieldProblemCode.TooSmall });
  }
  if ((start || end) && notice.category !== NoticeCategory.Maintenance) {
    problems.push({ path: ['windowStartsAt'], problem: FieldProblemCode.NotAllowed });
  }
  return problems;
}

function addProblems(problems: NoticeProblem[], ctx: z.RefinementCtx): void {
  for (const { path, problem } of problems) {
    ctx.addIssue({
      code: 'custom',
      path,
      message: 'Not a notice that can be saved.',
      params: { problem },
    });
  }
}

/** NTC-01: a new notice, saved as a draft unless it names when it goes live. */
export const noticeCreateSchema = z
  .object(noticeShape)
  .strict()
  .superRefine((value, ctx) => {
    addProblems(noticeProblems(value), ctx);
  });
export type NoticeCreateInput = z.infer<typeof noticeCreateSchema>;

/**
 * NTC-08: any part of a notice, changed. The whole notice's rules are checked once the change is laid over it, where the
 * server knows the rest.
 */
export const noticeUpdateSchema = z
  .object(noticeShape)
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Nothing to change.',
        params: { problem: FieldProblemCode.NothingToChange },
      });
    }
  });
export type NoticeUpdateInput = z.infer<typeof noticeUpdateSchema>;

/** A rate's value as the operator types it into a template: up to four decimals, as control.rates keeps it. */
const rateFigure = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,4})?$/);

/**
 * NTC-12, NTC-13: a template, and the variables it fills in. A rate-change template given the change
 * (control.rate_history's ID) fills the rate, its old and new values and the date from it.
 */
export const noticeTemplateSchema = z
  .object({
    template: z.nativeEnum(NoticeTemplate),
    variables: z
      .object({
        rateChangeId: z.number().int().positive().optional(),
        date: z.coerce.date().optional(),
        rateKey: z.nativeEnum(RateKey).optional(),
        oldRate: rateFigure.optional(),
        newRate: rateFigure.optional(),
        windowStartsAt: z.coerce.date().optional(),
        windowEndsAt: z.coerce.date().optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type NoticeTemplateInput = z.infer<typeof noticeTemplateSchema>;

/**
 * NTC-02 (Slice 7.7): the console's publish panel -- how many shops an audience takes in now, before the notice is saved.
 * The severity matters: an archived shop sees urgent notices only (NTC-07).
 */
export const noticeReachSchema = z
  .object({ audience: noticeAudienceSchema, severity: z.nativeEnum(NoticeSeverity) })
  .strict();
export type NoticeReachInput = z.infer<typeof noticeReachSchema>;

/** NTC-03: a page of the board, newest first after the pinned ones, by category or words. */
export const noticesQuerySchema = z
  .object({
    category: z.nativeEnum(NoticeCategory).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(NOTICES_PAGE_MAX).default(20),
    // Where the page starts: the board is pinned first, then newest, and at most 24 months long.
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export type NoticesQuery = z.infer<typeof noticesQuerySchema>;
