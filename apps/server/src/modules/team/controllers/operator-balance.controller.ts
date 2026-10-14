import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { BalanceService } from '../../balance/services/balance.service';
import type { LedgerEntry } from '../../balance/types/ledger-entry';
import { AdjustBalanceDto } from '../dto/balance.dto';
import { LedgerEntryDto } from '../dto/balance-response.dto';

// BAL-17: an operator's manual correction, with a required reason, audited to control.platform_audit_log.
@ApiTags('Operator Balance')
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorBalanceController {
  constructor(@Inject(BalanceService) private readonly balance: BalanceService) {}

  @Post(':id/balance-adjust')
  @HttpCode(200)
  @ResponseMessage('BalanceAdjusted')
  @ApiOperation({ summary: "Adjust a tenant's balance (operator correction)" })
  @ApiBody({ type: AdjustBalanceDto })
  @ZodResponse({ type: LedgerEntryDto })
  async adjust(
    @Param('id') tenantId: string,
    @Body(new ZodValidationPipe(AdjustBalanceDto.schema)) body: AdjustBalanceDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<LedgerEntry> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.balance.adjustStandalone({
      tenantId,
      amount: body.amount.toFixed(2),
      reason: body.reason,
      operatorId: session.operatorId,
    });
  }
}
