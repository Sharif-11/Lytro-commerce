import { Injectable, type PipeTransform } from '@nestjs/common';
import { fieldProblemsOf } from '@lytronix/validators';
import type { ZodTypeAny } from 'zod';
import { FieldsError } from '../api-error';

// Validates a request body or query against a Zod schema. A failure names each field and its problem (API-16),
// worded per request by ApiErrorFilter, never the library's own text. The schema is named on each route (for
// example @Body(new ZodValidationPipe(X.schema))), so validation does not depend on decorator metadata.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new FieldsError(fieldProblemsOf(result.error));
    return result.data;
  }
}
