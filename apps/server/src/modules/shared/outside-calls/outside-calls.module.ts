import { Global, Module } from '@nestjs/common';
import { OutsideCalls } from './services/outside-calls';

/** PRF-04, PRF-05, D9-17 (Phase 9 Slice 9.5): every outside call's breaker, for every module. */
@Global()
@Module({
  providers: [OutsideCalls],
  exports: [OutsideCalls],
})
export class OutsideCallsModule {}
