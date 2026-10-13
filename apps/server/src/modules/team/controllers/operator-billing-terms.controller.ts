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
  UseGuards,
} from '@nestjs/common';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import type { BillingTermRecord, PlanPriceRecord } from '../../billing/types/billing-term';
import { CreateBillingTermDto, SetPlanPriceDto, UpdateBillingTermDto } from '../dto/billing.dto';

// TRM-01 to TRM-16: the operator's billing-term editor, plus per-plan pricing (TRM-03).
@Controller('operator/billing-terms')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorBillingTermsController {
  constructor(@Inject(BillingTermsService) private readonly terms: BillingTermsService) {}

  @Get()
  list(): Promise<BillingTermRecord[]> {
    return this.terms.listAll(); // includes hidden/retired terms, unlike the public route
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBillingTermDto.schema)) body: CreateBillingTermDto,
  ): Promise<BillingTermRecord> {
    return this.terms.create({
      labelBn: body.labelBn,
      labelEn: body.labelEn,
      months: body.months,
      visible: body.visible,
      displayOrder: body.displayOrder,
      defaultDiscountPct: body.defaultDiscountPct?.toFixed(2) ?? null,
      tenantId: body.tenantId ?? null,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBillingTermDto.schema)) body: UpdateBillingTermDto,
  ): Promise<BillingTermRecord> {
    return this.terms.update(id, {
      labelBn: body.labelBn,
      labelEn: body.labelEn,
      months: body.months,
      visible: body.visible,
      displayOrder: body.displayOrder,
      defaultDiscountPct: body.defaultDiscountPct?.toFixed(2),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.terms.delete(id);
  }
}

// TRM-03: a plan's price for a term. Nested under the plan, not the term, since a price is a (plan, term) pair.
@Controller('operator/plans/:planId/prices')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlanPricesController {
  constructor(@Inject(BillingTermsService) private readonly terms: BillingTermsService) {}

  @Get()
  list(@Param('planId') planId: string): Promise<PlanPriceRecord[]> {
    return this.terms.listPricesForPlan(planId);
  }

  @Put(':billingTermId')
  @HttpCode(200)
  async set(
    @Param('planId') planId: string,
    @Param('billingTermId') billingTermId: string,
    @Body(new ZodValidationPipe(SetPlanPriceDto.schema)) body: SetPlanPriceDto,
  ): Promise<{ ok: true }> {
    await this.terms.setPrice(planId, billingTermId, body.price.toFixed(2));
    return { ok: true };
  }

  @Delete(':billingTermId')
  @HttpCode(204)
  async remove(
    @Param('planId') planId: string,
    @Param('billingTermId') billingTermId: string,
  ): Promise<void> {
    await this.terms.removePrice(planId, billingTermId);
  }
}
