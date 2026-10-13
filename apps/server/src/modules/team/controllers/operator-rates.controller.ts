import { Body, Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { RateKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { RateService } from '../../balance/services/rate.service';
import type { RateHistoryEntry, RateValue } from '../../balance/types/rate';
import { UpdateRateDto } from '../dto/balance.dto';

function isRateKey(key: string): key is RateKey {
  return (Object.values(RateKey) as string[]).includes(key);
}

function parseKey(key: string): RateKey {
  if (!isRateKey(key)) throw new ApiError('not_found', 'Unknown rate.', { key });
  return key;
}

// RAT-01 to RAT-14 (except RAT-14 itself, which is per-tenant): the operator's rate editor.
@Controller('operator/rates')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorRatesController {
  constructor(@Inject(RateService) private readonly rates: RateService) {}

  @Get()
  list(): Promise<RateValue[]> {
    return this.rates.list();
  }

  @Get(':key/history')
  history(@Param('key') key: string): Promise<RateHistoryEntry[]> {
    return this.rates.history(parseKey(key));
  }

  @Patch(':key')
  async change(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateRateDto.schema)) body: UpdateRateDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    await this.rates.change(
      parseKey(key),
      body.value.toFixed(2),
      session.operatorId,
      body.noticeId ?? null,
    );
    return { ok: true };
  }
}
