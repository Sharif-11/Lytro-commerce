import { describe, expect, it } from 'vitest';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import * as validators from '../src/index';
import {
  confirmPurchaseSchema,
  confirmUpgradeSchema,
  createBillingTermSchema,
  createShopSchema,
  FIELD_LABELS,
  fieldErrorsOf,
  FieldProblemCode,
  fieldProblemMessage,
  fieldProblemsOf,
  nonNegativeMoneyField,
  quoteTopUpSchema,
  requestEmailCodeSchema,
  setPasswordSchema,
  updateStaffSchema,
  validationSummary,
  verifySigninCodeSchema,
  type FieldProblem,
  type Language,
} from '../src/index';

function failureOf(schema: ZodTypeAny, value: unknown): ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected the value to fail');
  return result.error;
}

function messagesOf(schema: ZodTypeAny, value: unknown, language: Language): string[] {
  return fieldErrorsOf(fieldProblemsOf(failureOf(schema, value)), language).map((e) => e.message);
}

// API-16, I18N-01: each failed field gets a stable problem code and a plain message, in Bangla or English.
describe('what is wrong with each field', () => {
  it('says a password is too short, and by how much, in both languages', () => {
    const problems = fieldProblemsOf(failureOf(setPasswordSchema, { newPassword: 'abc' }));
    expect(problems).toEqual([{ field: 'newPassword', problem: 'too_short', min: 8 }]);
    expect(fieldProblemMessage(problems[0] as FieldProblem, 'en')).toBe(
      'New password is too short. Use at least 8 characters.',
    );
    expect(fieldProblemMessage(problems[0] as FieldProblem, 'bn')).toBe(
      'নিউ পাসওয়ার্ড খুব ছোট। কমপক্ষে 8 অক্ষর দিন।',
    );
  });

  it('says a missing name is required, and a long one is too long', () => {
    const value = { ownerName: '   ', shopName: 'x'.repeat(61) };
    expect(fieldProblemsOf(failureOf(createShopSchema, value))).toEqual([
      { field: 'ownerName', problem: 'required' },
      { field: 'shopName', problem: 'too_long', max: 60 },
    ]);
    expect(messagesOf(createShopSchema, value, 'en')).toEqual([
      'Your name is required.',
      'Shop name is too long. Use at most 60 characters.',
    ]);
    expect(messagesOf(createShopSchema, value, 'bn')).toEqual([
      'আপনার নাম দিন।',
      'শপের নাম অনেক বড়। সর্বোচ্চ 60 অক্ষর দিন।',
    ]);
  });

  it('reports a field that was never sent as required', () => {
    expect(fieldProblemsOf(failureOf(setPasswordSchema, {}))).toEqual([
      { field: 'newPassword', problem: 'required' },
    ]);
  });

  it('gives an example of the right format where a field needs one', () => {
    expect(messagesOf(requestEmailCodeSchema, { email: 'rahim@' }, 'en')).toEqual([
      'Enter a valid email address, like name@example.com.',
    ]);
    expect(messagesOf(verifySigninCodeSchema, { phone: '01711111111', code: '12a' }, 'bn')).toEqual(
      ['6 সংখ্যার কোডটি দিন।'],
    );
  });

  it('tells a number from a word, a whole number from a decimal, and an inclusive limit from an exclusive one', () => {
    expect(fieldProblemsOf(failureOf(quoteTopUpSchema, { amount: 'abc' }))).toEqual([
      { field: 'amount', problem: 'not_a_number' },
    ]);
    expect(messagesOf(quoteTopUpSchema, { amount: '-5' }, 'en')).toEqual([
      'Amount must be more than 0.',
    ]);

    const term = { labelBn: 'মাস', labelEn: 'Month', visible: true };
    expect(messagesOf(createBillingTermSchema, { ...term, months: 1.5 }, 'en')).toEqual([
      'Months must be a whole number, without decimals.',
    ]);
    expect(messagesOf(createBillingTermSchema, { ...term, months: 61 }, 'en')).toEqual([
      'Months must be at most 60.',
    ]);
    expect(messagesOf(nonNegativeMoneyField, -1, 'en')).toEqual(['This must be at least 0.']);
  });

  it('names a custom check problem: too many decimals', () => {
    expect(fieldProblemsOf(failureOf(nonNegativeMoneyField, 1.234))).toEqual([
      { field: '', problem: 'too_many_decimals' },
    ]);
  });

  it('says a choice outside the list is not one of the choices', () => {
    const payment = { paymentId: '7c1a3e0e-3f5f-4a43-9e47-0b6f6f1f1f1f', method: 'cash' };
    expect(messagesOf(confirmPurchaseSchema, payment, 'en')).toEqual([
      "Payment method isn't one of the available choices.",
    ]);
  });

  it('points at each wallet field a wallet payment is missing, on a purchase and an upgrade alike', () => {
    const payment = {
      paymentId: '7c1a3e0e-3f5f-4a43-9e47-0b6f6f1f1f1f',
      method: 'wallet',
      senderNumber: '01711111111',
    };
    for (const schema of [confirmPurchaseSchema, confirmUpgradeSchema]) {
      expect(fieldProblemsOf(failureOf(schema, payment))).toEqual([
        { field: 'transactionId', problem: 'required' },
        { field: 'amountPaid', problem: 'required' },
      ]);
    }
    expect(confirmPurchaseSchema.safeParse({ ...payment, method: 'balance' }).success).toBe(true);
  });

  it('says what to do when an edit changes nothing', () => {
    expect(messagesOf(updateStaffSchema, {}, 'bn')).toEqual(['সেভ করার আগে কিছু পরিবর্তন করুন।']);
  });

  it('keeps only the first problem of each field, so a missing value is not also called the wrong format', () => {
    const schema = z.object({
      code: z
        .string()
        .min(1)
        .regex(/^\d{6}$/),
    });
    expect(fieldProblemsOf(failureOf(schema, { code: '' }))).toEqual([
      { field: 'code', problem: 'required' },
    ]);
  });

  it('names a field inside a list by its own name, and says "this" for a field whose meaning varies', () => {
    const list = z.object({ items: z.array(z.object({ name: z.string().max(3) })) });
    expect(messagesOf(list, { items: [{ name: 'abcd' }] }, 'en')).toEqual([
      'Name is too long. Use at most 3 characters.',
    ]);
    const varying = z.object({ value: z.string().min(5) });
    expect(messagesOf(varying, { value: 'ab' }, 'bn')).toEqual([
      'এটি খুব ছোট। কমপক্ষে 5 অক্ষর দিন।',
    ]);
  });
});

describe('the message for a request as a whole', () => {
  it("is the one field's own message when only one failed", () => {
    const errors = fieldErrorsOf(
      fieldProblemsOf(failureOf(setPasswordSchema, { newPassword: 'a' })),
      'en',
    );
    expect(validationSummary(errors, 'en')).toBe(
      'New password is too short. Use at least 8 characters.',
    );
  });

  it('counts the fields when several failed', () => {
    const errors = fieldErrorsOf(
      fieldProblemsOf(failureOf(createShopSchema, { ownerName: '', shopName: '' })),
      'bn',
    );
    expect(validationSummary(errors, 'bn')).toBe(
      '2টি ফিল্ড ঠিক করতে হবে। হাইলাইট করা ফিল্ডগুলো চেক করুন।',
    );
  });
});

// Every field of every request schema has a name a person can read, so no message falls back to "this" by
// accident; a new field without one fails here, not in front of a shop owner.
describe('every request field is named in both languages', () => {
  function fieldsOf(schema: ZodTypeAny, into: Set<string>, seen = new Set<ZodTypeAny>()): void {
    if (seen.has(schema)) return;
    seen.add(schema);
    const def = schema._def as Record<string, unknown> & { typeName?: string };
    switch (def.typeName) {
      case 'ZodObject':
        for (const [key, child] of Object.entries(
          (schema as z.AnyZodObject).shape as z.ZodRawShape,
        )) {
          into.add(key);
          fieldsOf(child, into, seen);
        }
        break;
      case 'ZodEffects':
        fieldsOf(def['schema'] as ZodTypeAny, into, seen);
        break;
      case 'ZodOptional':
      case 'ZodNullable':
      case 'ZodDefault':
        fieldsOf(def['innerType'] as ZodTypeAny, into, seen);
        break;
      case 'ZodArray':
        fieldsOf(def['type'] as ZodTypeAny, into, seen);
        break;
      case 'ZodUnion':
        for (const option of def['options'] as ZodTypeAny[]) fieldsOf(option, into, seen);
        break;
      default:
        break;
    }
  }

  it('has a label, or a deliberate null, for each one', () => {
    const fields = new Set<string>();
    for (const [name, value] of Object.entries(validators)) {
      if (name.endsWith('Schema') && value instanceof z.ZodType) fieldsOf(value, fields);
    }
    expect(fields.size).toBeGreaterThan(50);
    const missing = [...fields].filter((field) => !(field in FIELD_LABELS));
    expect(missing).toEqual([]);
  });

  it('fills every placeholder of every message, in both languages', () => {
    for (const problem of Object.values(FieldProblemCode)) {
      for (const language of ['en', 'bn'] as const) {
        for (const field of ['shopName', 'value']) {
          for (const exclusive of [false, true]) {
            const message = fieldProblemMessage(
              { field, problem, min: 1, max: 9, length: 6, exclusive },
              language,
            );
            expect(message).not.toMatch(/[{}]/);
            expect(message.length).toBeGreaterThan(5);
          }
        }
      }
    }
  });
});
