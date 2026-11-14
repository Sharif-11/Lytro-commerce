import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DrizzleRequestErrorStore } from '../../database/adapters/request-errors.adapter';
import { ErrorTracker } from '../error-tracking/error-tracker';
import { RequestContext } from './request-context';
import { RequestErrors } from './request-errors';
import { RequestIdHandler } from './request-id-handler';
import { RequestIds } from './request-ids';
import { RequestLogger } from './request-logger';
import { ShopLogContext } from './shop-log-context';
import { REQUEST_ERROR_STORE } from './tokens';

// API-27, D8-3 (Phase 8 Slice 8.1): request IDs, the logger that prints them and shops' server faults, and the error
// tracker they go to (OBS-03, Slice 9.6). Global, since the error filter and HttpSetup, which every route passes
// through, reach them from outside any one module, as the job queue reaches the tracker.
@Global()
@Module({
  providers: [
    RequestIds,
    RequestContext,
    RequestIdHandler,
    RequestLogger,
    RequestErrors,
    ErrorTracker,
    { provide: REQUEST_ERROR_STORE, useClass: DrizzleRequestErrorStore },
    // LOG-01 (Slice 9.6): each request's shop into its log lines, once the guards found it.
    { provide: APP_INTERCEPTOR, useClass: ShopLogContext },
  ],
  exports: [RequestContext, RequestIdHandler, RequestLogger, RequestErrors, ErrorTracker],
})
export class RequestIdModule {}
