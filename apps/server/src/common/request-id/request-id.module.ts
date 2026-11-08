import { Global, Module } from '@nestjs/common';
import { DrizzleRequestErrorStore } from '../../database/adapters/request-errors.adapter';
import { RequestContext } from './request-context';
import { RequestErrors } from './request-errors';
import { RequestIdHandler } from './request-id-handler';
import { RequestIds } from './request-ids';
import { RequestLogger } from './request-logger';
import { REQUEST_ERROR_STORE } from './tokens';

// API-27, D8-3 (Phase 8 Slice 8.1): request IDs, the logger that prints them and shops' server faults. Global, since the
// error filter and HttpSetup, which every route passes through, reach them from outside any one module.
@Global()
@Module({
  providers: [
    RequestIds,
    RequestContext,
    RequestIdHandler,
    RequestLogger,
    RequestErrors,
    { provide: REQUEST_ERROR_STORE, useClass: DrizzleRequestErrorStore },
  ],
  exports: [RequestContext, RequestIdHandler, RequestLogger, RequestErrors],
})
export class RequestIdModule {}
