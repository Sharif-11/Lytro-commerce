import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { OkDto } from '../../../common/dto/ok.dto';
import { DowngradeService, type OverLimitItem } from '../../billing/services/downgrade.service';
import { LifecycleService } from '../../billing/services/lifecycle.service';
import { PurchaseService } from '../../billing/services/purchase.service';
import { UpgradeService } from '../../billing/services/upgrade.service';
import type { ScheduledPlanChangeRecord } from '../../billing/types/scheduled-plan-change';
import { InvoicesService } from '../../payments/services/invoices.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import {
  ConfirmPurchaseDto,
  ConfirmUpgradeDto,
  QuotePurchaseDto,
  QuoteUpgradeDto,
  SetAutoRenewDto,
  TargetDowngradePlanDto,
} from '../dto/billing.dto';
import {
  CancellationStatusDto,
  InvoiceDto,
  InvoiceListDto,
  OverLimitItemListDto,
  PlanPaymentDto,
  ScheduledPlanChangeDto,
} from '../dto/billing-response.dto';

// BIL-01 to BIL-13: a tenant's own purchase/renewal flow and invoices.
// LIF-11/LIF-12: `quote`, `purchase` and both invoice routes carry `lapsed: true` so a locked/archived/deleted
// owner can still renew and read invoices; DashboardGuard's own lapsed carve-out already restricts this to the
// owner session, never staff.
// LIF-24 (decided 2026-10-16): `quote` and `purchase` also carry `suspendedOwner: true`, since renewing/paying
// off a suspended tenant is exactly the "activity that benefits the operator side" a suspended owner is meant
// to still reach -- the invoice routes deliberately do not, since reading/exporting past invoices is not.
@ApiTags('Billing')
@Controller('billing')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BillingController {
  constructor(
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
  ) {}

  @Post('quote')
  @Dashboard({ lapsed: true, suspendedOwner: true })
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('QuoteCreated')
  @ApiOperation({ summary: 'Quote a plan purchase or renewal' })
  @ZodResponse({ type: PlanPaymentDto })
  quote(
    @Body(new ZodValidationPipe(QuotePurchaseDto.schema)) body: QuotePurchaseDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    return this.purchase.quote(this.tenantIdOf(request), body.planId, body.billingTermId);
  }

  @Post('purchase')
  @Dashboard({ lapsed: true, suspendedOwner: true, readOnlyWrite: true })
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('PurchaseConfirmed')
  @ApiOperation({
    summary: 'Confirm a plan purchase or renewal (from balance, or submit a wallet payment)',
  })
  @ZodResponse({ type: PlanPaymentDto })
  confirm(
    @Body(new ZodValidationPipe(ConfirmPurchaseDto.schema)) body: ConfirmPurchaseDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    const tenantId = this.tenantIdOf(request);
    if (body.method === 'balance') {
      return this.purchase.confirmFromBalance(body.paymentId, tenantId).then((r) => r.payment);
    }
    if (!body.transactionId || !body.senderNumber || body.amountPaid === undefined) {
      throw new ApiError('validation_error', 'TransactionIdRequired', {});
    }
    return this.purchase.submitWalletPayment(body.paymentId, tenantId, {
      transactionId: body.transactionId,
      senderNumber: body.senderNumber,
      amountPaid: body.amountPaid.toFixed(2),
    });
  }

  @Post('upgrade/quote')
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('UpgradeQuoted')
  @ApiOperation({ summary: 'Quote an upgrade to a higher-ranked plan' })
  @ZodResponse({ type: PlanPaymentDto })
  quoteUpgrade(
    @Body(new ZodValidationPipe(QuoteUpgradeDto.schema)) body: QuoteUpgradeDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    return this.upgrade.quote(this.tenantIdOf(request), body.planId, body.billingTermId);
  }

  @Post('upgrade/confirm')
  @Dashboard({ readOnlyWrite: true })
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('UpgradeConfirmed')
  @ApiOperation({ summary: 'Confirm an upgrade (from balance, or submit a wallet payment)' })
  @ZodResponse({ type: PlanPaymentDto })
  confirmUpgrade(
    @Body(new ZodValidationPipe(ConfirmUpgradeDto.schema)) body: ConfirmUpgradeDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    const tenantId = this.tenantIdOf(request);
    if (body.method === 'balance') {
      return this.upgrade.confirmFromBalance(body.paymentId, tenantId).then((r) => r.payment);
    }
    if (!body.transactionId || !body.senderNumber || body.amountPaid === undefined) {
      throw new ApiError('validation_error', 'TransactionIdRequired', {});
    }
    return this.upgrade.submitWalletPayment(body.paymentId, tenantId, {
      transactionId: body.transactionId,
      senderNumber: body.senderNumber,
      amountPaid: body.amountPaid.toFixed(2),
    });
  }

  @Post('downgrade/preview')
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('DowngradePreviewed')
  @ApiOperation({ summary: 'Preview the limits a downgrade would put the shop over' })
  @ZodResponse({ type: OverLimitItemListDto })
  previewDowngrade(
    @Body(new ZodValidationPipe(TargetDowngradePlanDto.schema)) body: TargetDowngradePlanDto,
    @Req() request: DashboardRequest,
  ): Promise<OverLimitItem[]> {
    return this.downgrade.preview(this.tenantIdOf(request), body.planId);
  }

  @Post('downgrade/schedule')
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('DowngradeScheduled')
  @ApiOperation({ summary: 'Schedule a downgrade, effective at the end of the current period' })
  @ZodResponse({ type: ScheduledPlanChangeDto })
  scheduleDowngrade(
    @Body(new ZodValidationPipe(TargetDowngradePlanDto.schema)) body: TargetDowngradePlanDto,
    @Req() request: DashboardRequest,
  ): Promise<ScheduledPlanChangeRecord> {
    return this.downgrade.schedule(this.tenantIdOf(request), body.planId);
  }

  @Post('downgrade/cancel')
  @ResponseMessage('DowngradeCancelled')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({ summary: 'Cancel a scheduled downgrade before it takes effect' })
  @ZodResponse({ type: OkDto })
  async cancelDowngrade(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.downgrade.cancel(this.tenantIdOf(request));
    return { ok: true };
  }

  @Get('downgrade')
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('DowngradeRetrieved')
  @ApiOperation({ summary: 'Get the scheduled downgrade, if any (null when nothing is scheduled)' })
  // No @ZodResponse here, deliberately: this is the one route that can return null (DWN-02), and
  // nestjs-zod's ZodDto typing has no clean way to express "this object, or null" as a response type.
  // Omitting the decorator just skips response validation for this route; ZodSerializerInterceptor
  // no-ops when no schema is attached, so `null` passes through untouched instead of crashing.
  getScheduledDowngrade(
    @Req() request: DashboardRequest,
  ): Promise<ScheduledPlanChangeRecord | null> {
    return this.downgrade.getScheduled(this.tenantIdOf(request));
  }

  @Post('cancel')
  @ResponseMessage('SubscriptionCancelled')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({ summary: 'Cancel, effective at the end of the current paid period (LIF-01)' })
  @ZodResponse({ type: OkDto })
  async cancelSubscription(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.lifecycle.cancelSubscription(this.tenantIdOf(request));
    return { ok: true };
  }

  @Post('cancel/undo')
  @ResponseMessage('SubscriptionCancellationUndone')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({ summary: 'Undo a cancellation before the current period ends (LIF-01)' })
  @ZodResponse({ type: OkDto })
  async undoCancellation(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.lifecycle.undoCancellation(this.tenantIdOf(request));
    return { ok: true };
  }

  @Get('cancellation')
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('CancellationRetrieved')
  @ApiOperation({ summary: 'Get whether a cancellation is currently scheduled (LIF-01)' })
  @ZodResponse({ type: CancellationStatusDto })
  getCancellation(@Req() request: DashboardRequest): Promise<{ cancelledAt: Date | null }> {
    return this.lifecycle.getCancellation(this.tenantIdOf(request));
  }

  @Post('auto-renew')
  @ResponseMessage('AutoRenewUpdated')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({
    summary: "Toggle the owner's own renew-automatically-from-balance setting (BIL-17)",
  })
  @ZodResponse({ type: OkDto })
  async setAutoRenew(
    @Body(new ZodValidationPipe(SetAutoRenewDto.schema)) body: SetAutoRenewDto,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.lifecycle.setAutoRenew(this.tenantIdOf(request), body.enabled);
    return { ok: true };
  }

  @Get('invoices')
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('InvoicesListed')
  @ApiOperation({ summary: "List the shop's invoices" })
  @ZodResponse({ type: InvoiceListDto })
  listInvoices(@Req() request: DashboardRequest): Promise<InvoiceRecord[]> {
    return this.invoices.listForTenant(this.tenantIdOf(request));
  }

  @Get('invoices/:id')
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('InvoiceRetrieved')
  @ApiOperation({ summary: 'Get one invoice' })
  @ZodResponse({ type: InvoiceDto })
  async getInvoice(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findById(id);
    if (invoice.tenantId !== this.tenantIdOf(request)) {
      throw new ApiError('not_found', 'InvoiceNotFound', {});
    }
    return invoice;
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
