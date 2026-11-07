import { describe, expect, it } from 'vitest';
import {
  fieldProblemsOf,
  FieldProblemCode,
  isNoticeLinkTarget,
  NoticeCategory,
  noticeCreateSchema,
  noticeProblems,
  noticesQuerySchema,
  noticeTemplateSchema,
  noticeUpdateSchema,
  rateValueWords,
  RateKey,
} from '../src/index';

// NTC-01, NTC-14, NTC-16 (Phase 7 Slice 7.4): what a notice must be before it is saved, written once for the server and
// the console.
const WHOLE = {
  titleEn: 'A title',
  bodyEn: 'A body',
  category: NoticeCategory.General,
  severity: 'info',
  audience: { kind: 'all' },
};

function problemsOf(value: unknown): Record<string, string> {
  const result = noticeCreateSchema.safeParse(value);
  if (result.success) return {};
  return Object.fromEntries(
    fieldProblemsOf(result.error).map((entry) => [entry.field, entry.problem]),
  );
}

describe('a notice (NTC-01, NTC-14, NTC-16)', () => {
  it('takes one whole language, and a language with a title has a body and the other way round', () => {
    expect(noticeCreateSchema.safeParse(WHOLE).success).toBe(true);
    expect(problemsOf({ ...WHOLE, titleEn: undefined, bodyEn: undefined })).toEqual({
      titleBn: FieldProblemCode.Required,
    });
    expect(problemsOf({ ...WHOLE, titleBn: 'শিরোনাম' })).toEqual({
      bodyBn: FieldProblemCode.Required,
    });
    expect(problemsOf({ ...WHOLE, bodyBn: 'লেখা' })).toEqual({
      titleBn: FieldProblemCode.Required,
    });
  });

  it('refuses a link that is not https, an end before the start, and a window that is half there or on the wrong kind', () => {
    expect(problemsOf({ ...WHOLE, bodyEn: '[a](http://x.y)' })).toEqual({
      bodyEn: FieldProblemCode.NotAllowed,
    });
    expect(
      problemsOf({ ...WHOLE, publishAt: '2026-11-08T10:00:00Z', endsAt: '2026-11-08T09:00:00Z' }),
    ).toEqual({ endsAt: FieldProblemCode.TooSmall });
    const maintenance = { ...WHOLE, category: NoticeCategory.Maintenance };
    expect(problemsOf({ ...maintenance, windowStartsAt: '2026-11-08T10:00:00Z' })).toEqual({
      windowEndsAt: FieldProblemCode.Required,
    });
    expect(
      problemsOf({
        ...maintenance,
        windowStartsAt: '2026-11-08T10:00:00Z',
        windowEndsAt: '2026-11-08T10:00:00Z',
      }),
    ).toEqual({ windowEndsAt: FieldProblemCode.TooSmall });
    expect(
      problemsOf({
        ...WHOLE,
        windowStartsAt: '2026-11-08T10:00:00Z',
        windowEndsAt: '2026-11-08T11:00:00Z',
      }),
    ).toEqual({ windowStartsAt: FieldProblemCode.NotAllowed });
  });

  it('keeps titles and bodies to their lengths, and names only the fields it knows', () => {
    expect(problemsOf({ ...WHOLE, titleEn: 'x'.repeat(121) })).toMatchObject({
      titleEn: FieldProblemCode.TooLong,
    });
    expect(problemsOf({ ...WHOLE, bodyEn: 'x'.repeat(5001) })).toMatchObject({
      bodyEn: FieldProblemCode.TooLong,
    });
    expect(noticeCreateSchema.safeParse({ ...WHOLE, colour: 'red' }).success).toBe(false);
  });

  it('reads an edit laid over the notice it changes, and an empty edit is nothing to change', () => {
    expect(noticeUpdateSchema.safeParse({}).success).toBe(false);
    expect(noticeUpdateSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(
      noticeProblems({ titleEn: 'Kept', bodyEn: null, category: NoticeCategory.General }),
    ).toEqual([{ path: ['bodyEn'], problem: FieldProblemCode.Required }]);
  });

  it('takes https links only, with a host', () => {
    expect(isNoticeLinkTarget('https://lytro.app/help')).toBe(true);
    for (const target of ['http://lytro.app', 'javascript:alert', 'https://', '//lytro.app']) {
      expect(isNoticeLinkTarget(target)).toBe(false);
    }
  });

  it('names the audience as all shops, plans, states or one shop', () => {
    for (const audience of [
      { kind: 'plans', planIds: [] },
      { kind: 'states', states: ['open'] },
      { kind: 'tenant' },
      { kind: 'everyone' },
    ]) {
      expect(noticeCreateSchema.safeParse({ ...WHOLE, audience }).success).toBe(false);
    }
  });
});

describe('the board and the templates (NTC-03, NTC-12)', () => {
  it('pages the board at most 50 at a time', () => {
    expect(noticesQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(noticesQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('takes a real rate and its figures in a template', () => {
    expect(noticeTemplateSchema.parse({ template: 'outage' }).variables).toEqual({});
    expect(
      noticeTemplateSchema.safeParse({
        template: 'rate_change',
        variables: { rateKey: 'sms', newRate: '0.6' },
      }).success,
    ).toBe(false);
    expect(
      noticeTemplateSchema.safeParse({
        template: 'rate_change',
        variables: { rateKey: RateKey.SmsPerUnit, newRate: 'six' },
      }).success,
    ).toBe(false);
  });

  it("writes a rate's value with its unit", () => {
    expect(rateValueWords(RateKey.SmsPerUnit, '0.5500')).toBe('৳0.55');
    expect(rateValueWords(RateKey.PaygOrderFeePct, '1.50')).toBe('1.5%');
    expect(rateValueWords(RateKey.SmsUnitSizeChars, '160.0000')).toBe('160');
  });
});
