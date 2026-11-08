import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  deleteShopDataSchema,
  extendPlanSchema,
  ownerResetSchema,
  type DeleteShopDataInput,
  type ExtendPlanInput,
  type OwnerResetInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  PlanExtensionService,
  type PlanExtension,
} from '../../billing/services/plan-extension.service';
import { ShopDataDeletionService } from '../../billing/services/shop-data-deletion.service';
import { OwnerSignInResetService } from '../../identity/services/owner-sign-in-reset.service';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { OwnerResetDoneDto, PlanExtensionDto } from '../dto/operator-shop-reads.dto';

// ADM-04, ADM-13 (Phase 8 Slice 8.3): what the operator does to a shop. Each takes a reason and writes both audit logs.
@ApiTags('Operator Tenants')
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorShopActionsController {
  constructor(
    @Inject(PlanExtensionService) private readonly extensions: PlanExtensionService,
    @Inject(OwnerSignInResetService) private readonly resets: OwnerSignInResetService,
    @Inject(ShopDataDeletionService) private readonly deletions: ShopDataDeletionService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post(':id/extend')
  @HttpCode(200)
  @ResponseMessage('PlanExtended')
  @ApiOperation({
    summary: "Add whole days to a shop's plan or trial, with a reason (ADM-04, D8-12)",
  })
  @ZodResponse({ type: PlanExtensionDto })
  extend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendPlanSchema)) body: ExtendPlanInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanExtension> {
    return this.extensions.extend({
      tenantId: id,
      days: body.days,
      reason: body.reason,
      operatorId: this.operatorOf(request),
      ip: this.clientIp.resolve(request),
    });
  }

  @Post(':id/owner-reset')
  @HttpCode(200)
  @ResponseMessage('OwnerSignInReset')
  @ApiOperation({
    summary:
      "Sign the owner out everywhere and send a reset code to the phone they gave, which becomes the account's (ADM-04, D8-5)",
  })
  @ZodResponse({ type: OwnerResetDoneDto })
  ownerReset(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ownerResetSchema)) body: OwnerResetInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ phoneChanged: boolean }> {
    return this.resets.reset({
      tenantId: id,
      phone: body.phone,
      reason: body.reason,
      operatorId: this.operatorOf(request),
      ip: this.clientIp.resolve(request),
    });
  }

  @Post(':id/delete-data')
  @HttpCode(200)
  @ResponseMessage('ShopDataDeletionStarted')
  @ApiOperation({
    summary:
      'Take a shop offline and delete its data on request, its address typed to confirm; the account and billing records stay (ADM-13, D8-13)',
  })
  @ZodResponse({ type: OkDto })
  async deleteData(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteShopDataSchema)) body: DeleteShopDataInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.deletions.request({
      tenantId: id,
      confirmAddress: body.confirmAddress,
      reason: body.reason,
      operatorId: this.operatorOf(request),
      ip: this.clientIp.resolve(request),
    });
    return { ok: true };
  }

  private operatorOf(request: OperatorSessionRequest): string {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return session.operatorId;
  }
}
