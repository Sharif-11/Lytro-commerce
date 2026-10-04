import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../api-error';

// Validates a request body against a Zod schema, and reports failures in the documented error format rather than
// the library's own shape. The schema is named on each route (for example @Body(new ZodValidationPipe(X.schema))),
// so validation does not depend on decorator metadata being emitted.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError('validation_error', 'Check the highlighted fields.', {
        fields: result.error.issues.map((issue) => issue.path.join('.')),
      });
    }
    return result.data;
  }
}
