import { Injectable, type PipeTransform } from '@nestjs/common';
import { FIELD_PROBLEM_PARSE, fieldProblemsOf } from '@lytronix/validators';
import type { z } from 'zod';
import { FieldsError } from '../api-error';

// Validates a request body or query against a Zod schema. A failure names each field and its problem (API-16),
// worded per request by ApiErrorFilter, never the library's own text. The schema is named on each route (for
// example @Body(new ZodValidationPipe(X.schema))), so validation does not depend on decorator metadata.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}

  transform(value: unknown): unknown {
    // Zod 4 keeps the value given on an issue only when asked: it is how a missing field reads as missing.
    const result = this.schema.safeParse(value, FIELD_PROBLEM_PARSE);
    if (!result.success) throw new FieldsError(fieldProblemsOf(result.error));
    return result.data;
  }
}
