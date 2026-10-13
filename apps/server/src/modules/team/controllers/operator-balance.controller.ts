import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { BalanceService } from '../../balance/services/balance.service';
import type { LedgerEntry } from '../../balance/types/ledger-entry';
import { AdjustBalanceDto } from '../dto/balance.dto';

// BAL-17: an operator's manual correction, with a required reason, audited to control.platform_audit_log.
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorBalanceController {
  constructor(@Inject(BalanceService) private readonly balance: BalanceService) {}

  @Post(':id/balance-adjust')
  @HttpCode(200)
  async adjust(
    @Param('id') tenantId: string,
    @Body(new ZodValidationPipe(AdjustBalanceDto.schema)) body: AdjustBalanceDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<LedgerEntry> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    return this.balance.adjustStandalone({
      tenantId,
      amount: body.amount.toFixed(2),
      reason: body.reason,
      operatorId: session.operatorId,
    });
  }
}
