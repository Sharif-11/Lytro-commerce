import { Body, Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { RateKey } from '@lytronix/validators';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { RateService } from '../../balance/services/rate.service';
import type { RateHistoryEntry, RateValue } from '../../balance/types/rate';
import { UpdateRateDto } from '../dto/balance.dto';
import { RateHistoryEntryDto, RateValueDto } from '../dto/balance-response.dto';

function isRateKey(key: string): key is RateKey {
  return (Object.values(RateKey) as string[]).includes(key);
}

function parseKey(key: string): RateKey {
  if (!isRateKey(key)) throw new ApiError('not_found', 'UnknownRate', { key });
  return key;
}

// RAT-01 to RAT-14 (except RAT-14 itself, which is per-tenant): the operator's rate editor.
@ApiTags('Operator Rates')
@Controller('operator/rates')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorRatesController {
  constructor(@Inject(RateService) private readonly rates: RateService) {}

  @Get()
  @ResponseMessage('RatesListed')
  @ApiOperation({ summary: 'List every platform rate' })
  @ZodResponse({ type: [RateValueDto] })
  list(): Promise<RateValue[]> {
    return this.rates.list();
  }

  @Get(':key/history')
  @ResponseMessage('RateHistoryRetrieved')
  @ApiOperation({ summary: "List a rate's change history" })
  @ZodResponse({ type: [RateHistoryEntryDto] })
  history(@Param('key') key: string): Promise<RateHistoryEntry[]> {
    return this.rates.history(parseKey(key));
  }

  @Patch(':key')
  @ResponseMessage('RateUpdated')
  @ApiOperation({ summary: 'Update a platform rate' })
  @ApiBody({ type: UpdateRateDto })
  @ZodResponse({ type: OkDto })
  async change(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateRateDto.schema)) body: UpdateRateDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.rates.change(
      parseKey(key),
      body.value.toFixed(2),
      session.operatorId,
      body.noticeId ?? null,
    );
    return { ok: true };
  }
}
