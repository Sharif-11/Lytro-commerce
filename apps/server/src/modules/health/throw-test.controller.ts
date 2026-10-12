import { Controller, Get } from '@nestjs/common';
import { SkipEdge } from '../../common/decorators/skip-edge';
import { SkipTenant } from '../../common/decorators/skip-tenant';

/**
 * Test-only route (P1-N03, SEC-16): throws an unhandled, non-ApiError exception on demand, so a test can
 * confirm the global filter never lets a stack trace, file path or raw error message reach a response body.
 * Registered only under NODE_ENV=test (see app.module.ts) — never exists outside a test run, same gating
 * SmsWorker/MailWorker/JobRelay use to stay out of production.
 */
@Controller('test-only/throw')
@SkipTenant()
@SkipEdge()
export class ThrowTestController {
  @Get()
  throw(): never {
    throw new TypeError(
      'deliberate unhandled error from /test-only/throw, at /some/internal/file/path.ts',
    );
  }
}
