import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import type { BillingTermRecord, PlanPriceRecord } from '../../billing/types/billing-term';
import { CreateBillingTermDto, SetPlanPriceDto, UpdateBillingTermDto } from '../dto/billing.dto';
import { BillingTermDto, BillingTermListDto, PlanPriceListDto } from '../dto/billing-response.dto';

// TRM-01 to TRM-16: the operator's billing-term editor, plus per-plan pricing (TRM-03).
@ApiTags('Operator Billing Terms')
@Controller('operator/billing-terms')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorBillingTermsController {
  constructor(
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('BillingTermsListed')
  @ApiOperation({ summary: 'List every billing term, including hidden and retired ones' })
  @ZodResponse({ type: BillingTermListDto })
  list(): Promise<BillingTermRecord[]> {
    return this.terms.listAll(); // includes hidden/retired terms, unlike the public route
  }

  @Post()
  @ResponseMessage('BillingTermCreated')
  @ApiOperation({ summary: 'Create a billing term' })
  @ApiBody({ type: CreateBillingTermDto })
  @ZodResponse({ type: BillingTermDto })
  create(
    @Body(new ZodValidationPipe(CreateBillingTermDto.schema)) body: CreateBillingTermDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<BillingTermRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.terms.create(
      {
        labelBn: body.labelBn,
        labelEn: body.labelEn,
        months: body.months,
        visible: body.visible,
        displayOrder: body.displayOrder,
        defaultDiscountPct: body.defaultDiscountPct?.toFixed(2) ?? null,
        tenantId: body.tenantId ?? null,
      },
      session.operatorId,
      this.clientIp.resolve(request),
    );
  }

  @Patch(':id')
  @ResponseMessage('BillingTermUpdated')
  @ApiOperation({ summary: 'Update a billing term' })
  @ApiBody({ type: UpdateBillingTermDto })
  @ZodResponse({ type: BillingTermDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBillingTermDto.schema)) body: UpdateBillingTermDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<BillingTermRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.terms.update(
      id,
      {
        labelBn: body.labelBn,
        labelEn: body.labelEn,
        months: body.months,
        visible: body.visible,
        displayOrder: body.displayOrder,
        defaultDiscountPct: body.defaultDiscountPct?.toFixed(2),
      },
      session.operatorId,
      this.clientIp.resolve(request),
    );
  }

  @Post(':id/retire')
  @HttpCode(200)
  @ResponseMessage('BillingTermRetired')
  @ApiOperation({
    summary: 'Retire a billing term: stops new purchases/renewals, keeps existing ones unaffected',
  })
  @ZodResponse({ type: BillingTermDto })
  retire(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<BillingTermRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.terms.retire(id, session.operatorId, this.clientIp.resolve(request));
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('BillingTermDeleted')
  @ApiOperation({ summary: 'Delete a billing term (only if unreferenced)' })
  @ZodResponse({ type: OkDto })
  async delete(@Param('id') id: string): Promise<{ ok: true }> {
    await this.terms.delete(id);
    return { ok: true };
  }
}

// TRM-03: a plan's price for a term. Nested under the plan, not the term, since a price is a (plan, term) pair.
@ApiTags('Operator Plan Prices')
@Controller('operator/plans/:planId/prices')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlanPricesController {
  constructor(@Inject(BillingTermsService) private readonly terms: BillingTermsService) {}

  @Get()
  @ResponseMessage('PlanPricesListed')
  @ApiOperation({ summary: "List a plan's prices across billing terms" })
  @ZodResponse({ type: PlanPriceListDto })
  list(@Param('planId') planId: string): Promise<PlanPriceRecord[]> {
    return this.terms.listPricesForPlan(planId);
  }

  @Put(':billingTermId')
  @HttpCode(200)
  @ResponseMessage('PlanPriceSet')
  @ApiOperation({ summary: "Set a plan's price for a billing term" })
  @ApiBody({ type: SetPlanPriceDto })
  @ZodResponse({ type: OkDto })
  async set(
    @Param('planId') planId: string,
    @Param('billingTermId') billingTermId: string,
    @Body(new ZodValidationPipe(SetPlanPriceDto.schema)) body: SetPlanPriceDto,
  ): Promise<{ ok: true }> {
    await this.terms.setPrice(planId, billingTermId, body.price.toFixed(2));
    return { ok: true };
  }

  @Delete(':billingTermId')
  @HttpCode(200)
  @ResponseMessage('PlanPriceRemoved')
  @ApiOperation({ summary: "Remove a plan's price for a billing term" })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('planId') planId: string,
    @Param('billingTermId') billingTermId: string,
  ): Promise<{ ok: true }> {
    await this.terms.removePrice(planId, billingTermId);
    return { ok: true };
  }
}
