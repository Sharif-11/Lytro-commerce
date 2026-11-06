import { z } from 'zod';
import { calendarDayField, checkPeriod } from '../../common/dates';
import { NAME_MAX_LENGTH } from '../../common/limits';
import { nonNegativeMoneyField } from '../../common/money';
import {
  SMS_EVENTS,
  SMS_REQUIRED_VARIABLE,
  SMS_TEMPLATE_MAX_LENGTH,
  smsVariablesIn,
} from '../../common/sms-templates';
import { SmsEvent } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

/** SMS-13: the smallest monthly cap a shop may set, in taka. */
export const SMS_SPEND_CAP_MIN = 1;

/**
 * SMS-02, SMS-10, SMS-13, SMS-16 (Slice 7.2): what an owner changes in SMS settings, any part of it. An event's switch;
 * its template, which keeps `{order_number}` and names only its own variables; the short name every SMS starts with
 * (null goes back to the shop's name); and the month's spend cap (null is none).
 */
export const smsSettingsUpdateSchema = z
  .object({
    events: z.record(z.nativeEnum(SmsEvent), z.boolean()).optional(),
    templates: z
      .record(z.nativeEnum(SmsEvent), z.string().trim().min(1).max(SMS_TEMPLATE_MAX_LENGTH))
      .optional(),
    smsName: z.string().trim().min(1).max(NAME_MAX_LENGTH).nullable().optional(),
    monthlySpendCap: nonNegativeMoneyField
      .refine((value) => value >= SMS_SPEND_CAP_MIN, {
        message: `At least ${String(SMS_SPEND_CAP_MIN)}.`,
        params: { problem: FieldProblemCode.TooSmall, min: SMS_SPEND_CAP_MIN },
      })
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const event of Object.values(SmsEvent)) {
      const template = value.templates?.[event];
      if (template === undefined) continue;
      const named = smsVariablesIn(template);
      const allowed: readonly string[] = SMS_EVENTS[event].variables;
      if (named.some((name) => !allowed.includes(name))) {
        ctx.addIssue({
          code: 'custom',
          path: ['templates', event],
          message: 'Names a variable this SMS cannot fill in.',
          params: { problem: FieldProblemCode.UnknownVariable },
        });
      } else if (!named.includes(SMS_REQUIRED_VARIABLE)) {
        ctx.addIssue({
          code: 'custom',
          path: ['templates', event],
          message: 'Keep {order_number}.',
          params: { problem: FieldProblemCode.MissingVariable },
        });
      }
    }
    if (
      value.events === undefined &&
      value.templates === undefined &&
      value.smsName === undefined &&
      value.monthlySpendCap === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Nothing to change.',
        params: { problem: FieldProblemCode.NothingToChange },
      });
    }
  });
export type SmsSettingsUpdateInput = z.infer<typeof smsSettingsUpdateSchema>;

/** SMS-14: the days a report covers, at most a quarter; left out, the last 30 days to today. */
export const SMS_REPORT_MAX_DAYS = 92;

/** SMS-14: a report's first and last days, in Dhaka. */
export const smsReportQuerySchema = z
  .object({ dateFrom: calendarDayField.optional(), dateTo: calendarDayField.optional() })
  .strict()
  .superRefine((value, ctx) => {
    checkPeriod(value, ctx);
    if (value.dateFrom && value.dateTo) {
      const days =
        (Date.parse(`${value.dateTo}T00:00:00Z`) - Date.parse(`${value.dateFrom}T00:00:00Z`)) /
          86_400_000 +
        1;
      if (days > SMS_REPORT_MAX_DAYS) {
        ctx.addIssue({
          code: 'custom',
          path: ['dateTo'],
          message: `At most ${String(SMS_REPORT_MAX_DAYS)} days.`,
          params: { problem: FieldProblemCode.TooLarge, max: SMS_REPORT_MAX_DAYS },
        });
      }
    }
  });
export type SmsReportQuery = z.infer<typeof smsReportQuerySchema>;

/** SMS-17: the most SMS one page of the log holds. */
export const SMS_LOG_PAGE_MAX = 100;

/** SMS-17: a page of the shop's SMS log, newest first, before a row's ID; one order's alone when asked. */
export const smsLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(SMS_LOG_PAGE_MAX).default(50),
    before: z.coerce.number().int().positive().optional(),
    orderId: z.string().uuid().optional(),
  })
  .strict();
export type SmsLogQuery = z.infer<typeof smsLogQuerySchema>;
