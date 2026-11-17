import type { core, ZodError } from 'zod';
import { FieldProblemCode, type FieldProblem } from './field-problem';

const PROBLEM_CODES: readonly FieldProblemCode[] = Object.values(FieldProblemCode);

/**
 * How a request is parsed for API-16: Zod 4 keeps the value it was given on an issue only when asked, and that value
 * is how a missing field (`undefined` or `null`) is told from one of the wrong type. It stays on the issue, which
 * `fieldProblemsOf` reads and drops: only the field and its problem leave the server.
 */
export const FIELD_PROBLEM_PARSE = { reportInput: true } as const;

/**
 * A custom check (`refine`/`superRefine`) names its problem in `params.problem`, and may give the limit it
 * checked; one that names none is reported as a format problem.
 */
function customProblem(field: string, params: Record<string, unknown> | undefined): FieldProblem {
  const named = params?.['problem'];
  const problem = PROBLEM_CODES.find((code) => code === named) ?? FieldProblemCode.InvalidFormat;
  const result: FieldProblem = { field, problem };
  for (const key of ['min', 'max', 'length'] as const) {
    const value = params?.[key];
    if (typeof value === 'number') result[key] = value;
  }
  return result;
}

function problemsOf(issue: core.$ZodIssue): FieldProblem[] {
  const field = issue.path.join('.');
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null) {
        return [{ field, problem: FieldProblemCode.Required }];
      }
      // Zod 4 says `int` where Zod 3 said `integer`; a number that is not finite (NaN, Infinity) is a wrong number.
      if (issue.expected === 'int') return [{ field, problem: FieldProblemCode.NotWholeNumber }];
      if (issue.expected === 'number' || issue.expected === 'bigint') {
        return [{ field, problem: FieldProblemCode.NotANumber }];
      }
      // An invalid Date is also this issue in Zod 4 (Zod 3's `invalid_date`).
      if (issue.expected === 'date') return [{ field, problem: FieldProblemCode.InvalidDate }];
      return [{ field, problem: FieldProblemCode.WrongType }];

    case 'too_small': {
      const min = Number(issue.minimum);
      switch (issue.origin) {
        case 'string':
          if (issue.exact === true)
            return [{ field, problem: FieldProblemCode.WrongLength, length: min }];
          // An empty value against "at least 1 character" is simply missing.
          if (min <= 1) return [{ field, problem: FieldProblemCode.Required }];
          return [{ field, problem: FieldProblemCode.TooShort, min }];
        case 'array':
        case 'set':
          return [{ field, problem: FieldProblemCode.TooFew, min }];
        case 'date':
          return [{ field, problem: FieldProblemCode.InvalidDate }];
        default:
          return [
            {
              field,
              problem: FieldProblemCode.TooSmall,
              min,
              ...(issue.inclusive ? {} : { exclusive: true }),
            },
          ];
      }
    }

    case 'too_big': {
      const max = Number(issue.maximum);
      switch (issue.origin) {
        case 'string':
          if (issue.exact === true)
            return [{ field, problem: FieldProblemCode.WrongLength, length: max }];
          return [{ field, problem: FieldProblemCode.TooLong, max }];
        case 'array':
        case 'set':
          return [{ field, problem: FieldProblemCode.TooMany, max }];
        case 'date':
          return [{ field, problem: FieldProblemCode.InvalidDate }];
        default:
          return [
            {
              field,
              problem: FieldProblemCode.TooLarge,
              max,
              ...(issue.inclusive ? {} : { exclusive: true }),
            },
          ];
      }
    }

    // Zod 3's `invalid_string`, named by its format.
    case 'invalid_format':
      switch (issue.format) {
        case 'email':
          return [{ field, problem: FieldProblemCode.InvalidEmail }];
        case 'url':
          return [{ field, problem: FieldProblemCode.InvalidUrl }];
        case 'date':
        case 'datetime':
        case 'time':
          return [{ field, problem: FieldProblemCode.InvalidDate }];
        default:
          return [{ field, problem: FieldProblemCode.InvalidFormat }];
      }

    // Zod 3's `invalid_enum_value` and `invalid_literal`.
    case 'invalid_value':
      return [{ field, problem: FieldProblemCode.NotAllowed }];

    // Zod 3's `invalid_union_discriminator` is a union issue naming its discriminator in Zod 4, on the discriminator's
    // own path as before; any other union no option fits stays a wrong type.
    case 'invalid_union':
      return [
        {
          field,
          problem:
            issue.discriminator === undefined
              ? FieldProblemCode.WrongType
              : FieldProblemCode.NotAllowed,
        },
      ];

    case 'not_multiple_of':
      return [
        {
          field,
          problem:
            issue.divisor === 1 ? FieldProblemCode.NotWholeNumber : FieldProblemCode.InvalidFormat,
        },
      ];

    case 'unrecognized_keys':
      return issue.keys.map((key) => ({
        field: [...issue.path, key].join('.'),
        problem: FieldProblemCode.NotAllowed,
      }));

    case 'custom':
      return [customProblem(field, issue.params)];

    default:
      return [{ field, problem: FieldProblemCode.WrongType }];
  }
}

/**
 * API-16: what is wrong with each field of a request that failed its schema -- one problem per field, the first
 * one found (a missing value before its format), in the order the fields were checked. The schema is parsed with
 * FIELD_PROBLEM_PARSE, so a missing field reads as missing.
 */
export function fieldProblemsOf(error: ZodError): FieldProblem[] {
  const byField = new Map<string, FieldProblem>();
  for (const issue of error.issues) {
    for (const problem of problemsOf(issue)) {
      if (!byField.has(problem.field)) byField.set(problem.field, problem);
    }
  }
  return [...byField.values()];
}
