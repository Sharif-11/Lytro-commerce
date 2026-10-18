import { ZodIssueCode, type ZodError, type ZodIssue } from 'zod';
import { FieldProblemCode, type FieldProblem } from './field-problem';

const PROBLEM_CODES: readonly FieldProblemCode[] = Object.values(FieldProblemCode);

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

function problemsOf(issue: ZodIssue): FieldProblem[] {
  const field = issue.path.join('.');
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return [{ field, problem: FieldProblemCode.Required }];
      }
      if (issue.expected === 'integer')
        return [{ field, problem: FieldProblemCode.NotWholeNumber }];
      if (issue.expected === 'number' || issue.expected === 'bigint') {
        return [{ field, problem: FieldProblemCode.NotANumber }];
      }
      if (issue.expected === 'date') return [{ field, problem: FieldProblemCode.InvalidDate }];
      return [{ field, problem: FieldProblemCode.WrongType }];

    case ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      switch (issue.type) {
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

    case ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      switch (issue.type) {
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

    case ZodIssueCode.invalid_string:
      switch (issue.validation) {
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

    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union_discriminator:
      return [{ field, problem: FieldProblemCode.NotAllowed }];

    case ZodIssueCode.invalid_date:
      return [{ field, problem: FieldProblemCode.InvalidDate }];

    case ZodIssueCode.not_multiple_of:
      return [
        {
          field,
          problem:
            Number(issue.multipleOf) === 1
              ? FieldProblemCode.NotWholeNumber
              : FieldProblemCode.InvalidFormat,
        },
      ];

    case ZodIssueCode.not_finite:
      return [{ field, problem: FieldProblemCode.NotANumber }];

    case ZodIssueCode.unrecognized_keys:
      return issue.keys.map((key) => ({
        field: [...issue.path, key].join('.'),
        problem: FieldProblemCode.NotAllowed,
      }));

    case ZodIssueCode.custom:
      return [customProblem(field, issue.params)];

    default:
      return [{ field, problem: FieldProblemCode.WrongType }];
  }
}

/**
 * API-16: what is wrong with each field of a request that failed its schema -- one problem per field, the first
 * one found (a missing value before its format), in the order the fields were checked. The same on the server
 * and in the dashboard, since both check the same schema.
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
