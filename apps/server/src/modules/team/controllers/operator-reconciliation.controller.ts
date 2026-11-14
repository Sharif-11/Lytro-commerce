import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { ReconciliationListQuery, ReconciliationResolveInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  ReconciliationDifferences,
  type ListedDifferenceRecord,
  type ReconciliationDifferenceRecord,
} from '../../reconciliation/services/reconciliation-differences';
import {
  ReconciliationDifferenceDto,
  ReconciliationDifferencePageDto,
  ReconciliationListQueryDto,
  ReconciliationResolveDto,
} from '../dto/operator-reconciliation.dto';

function operatorIdOf(request: OperatorSessionRequest): string {
  const session = request.operatorSession;
  if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
  return session.operatorId;
}

// DAT-52, D9-16 (Phase 9 Slice 9.5): what the daily reconciliation found, and the operator's word on each difference. The
// screens are Slice 9.9's.
@ApiTags('Operator Reconciliation')
@Controller('operator/reconciliation')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorReconciliationController {
  constructor(
    @Inject(ReconciliationDifferences) private readonly differences: ReconciliationDifferences,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get('differences')
  @ResponseMessage('ReconciliationDifferencesListed')
  @ApiOperation({
    summary:
      "The daily reconciliation's differences: open ones by default, newest day first (DAT-52)",
  })
  @ZodResponse({ type: ReconciliationDifferencePageDto })
  async list(
    @Query(new ZodValidationPipe(ReconciliationListQueryDto.schema)) query: ReconciliationListQuery,
  ): Promise<{
    differences: ListedDifferenceRecord[];
    page: number;
    limit: number;
    total: number;
    pages: number;
    lastRun: { day: string; ranAt: Date } | null;
  }> {
    const { rows, total, lastRun } = await this.differences.list(query);
    return {
      differences: rows,
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
      lastRun,
    };
  }

  @Post('differences/:id/resolve')
  @HttpCode(200)
  @ResponseMessage('ReconciliationDifferenceResolved')
  @ApiOperation({
    summary: 'Resolve a difference with what was done about it; audited (DAT-52, ADM-08)',
  })
  @ApiBody({ type: ReconciliationResolveDto })
  @ZodResponse({ type: ReconciliationDifferenceDto })
  resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReconciliationResolveDto.schema)) body: ReconciliationResolveInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<ReconciliationDifferenceRecord> {
    return this.differences.resolve(id, body.note, {
      operatorId: operatorIdOf(request),
      ip: this.clientIp.resolve(request),
    });
  }
}
