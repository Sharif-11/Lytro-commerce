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
import { ClientIp } from '../../../common/client-ip';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { OkDto } from '../../../common/dto/ok.dto';
import {
  DowngradeService,
  type OverLimitItem,
  type PayAsYouGoChoice,
} from '../../billing/services/downgrade.service';
import { LifecycleService } from '../../billing/services/lifecycle.service';
import { PurchaseService } from '../../billing/services/purchase.service';
import { UpgradeService } from '../../billing/services/upgrade.service';
import type { ScheduledPlanChangeRecord } from '../../billing/types/scheduled-plan-change';
import { InvoicesService } from '../../payments/services/invoices.service';
import { TenantService } from '../../tenancy/services/tenant.service';
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
  PayAsYouGoChoiceDto,
  PlanPaymentDto,
  ScheduledPlanChangeDto,
} from '../dto/billing-response.dto';

/** An invoice as the billing screen lists it: this shop's own, or one from the owner's earlier shop. */
type ListedInvoice = InvoiceRecord & { earlierShop: boolean };

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
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
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
      return this.purchase
        .confirmFromBalance(body.paymentId, tenantId, this.clientIp.resolve(request))
        .then((r) => r.payment);
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
      return this.upgrade
        .confirmFromBalance(body.paymentId, tenantId, this.clientIp.resolve(request))
        .then((r) => r.payment);
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
    return this.downgrade.schedule(
      this.tenantIdOf(request),
      body.planId,
      this.clientIp.resolve(request),
    );
  }

  @Post('downgrade/cancel')
  @ResponseMessage('DowngradeCancelled')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({ summary: 'Cancel a scheduled downgrade before it takes effect' })
  @ZodResponse({ type: OkDto })
  async cancelDowngrade(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.downgrade.cancel(this.tenantIdOf(request), this.clientIp.resolve(request));
    return { ok: true };
  }

  // PYG-01, PYG-10, LIF-15: scheduled for the period's end while a paid period runs, cancelled through
  // `downgrade/cancel` and shown by `GET downgrade` like any scheduled change; at once for a lapsed shop, which
  // only its owner can reach (DashboardGuard's lapsed carve-out).
  @Post('pay-as-you-go')
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('PayAsYouGoChosen')
  @ApiOperation({
    summary: "Choose pay-as-you-go: at the paid period's end, or at once for a lapsed shop",
  })
  @ZodResponse({ type: PayAsYouGoChoiceDto })
  choosePayAsYouGo(@Req() request: DashboardRequest): Promise<PayAsYouGoChoice> {
    return this.downgrade.choosePayAsYouGo(
      this.tenantIdOf(request),
      this.clientIp.resolve(request),
    );
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
    await this.lifecycle.cancelSubscription(
      this.tenantIdOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Post('cancel/undo')
  @ResponseMessage('SubscriptionCancellationUndone')
  @RequirePermission(Permission.PaymentsManage)
  @ApiOperation({ summary: 'Undo a cancellation before the current period ends (LIF-01)' })
  @ZodResponse({ type: OkDto })
  async undoCancellation(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.lifecycle.undoCancellation(this.tenantIdOf(request), this.clientIp.resolve(request));
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
    await this.lifecycle.setAutoRenew(
      this.tenantIdOf(request),
      body.enabled,
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Get('invoices')
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('InvoicesListed')
  @ApiOperation({ summary: "List the shop's invoices" })
  @ZodResponse({ type: InvoiceListDto })
  async listInvoices(@Req() request: DashboardRequest): Promise<ListedInvoice[]> {
    const tenantId = this.tenantIdOf(request);
    const earlier = await this.earlierShopsOf(request, tenantId);
    const invoices = await this.invoices.listForTenants([tenantId, ...earlier]);
    return invoices.map((invoice) => ({ ...invoice, earlierShop: invoice.tenantId !== tenantId }));
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
  ): Promise<ListedInvoice> {
    const tenantId = this.tenantIdOf(request);
    const invoice = await this.invoices.findById(id);
    if (invoice.tenantId === tenantId) return { ...invoice, earlierShop: false };
    if ((await this.earlierShopsOf(request, tenantId)).includes(invoice.tenantId)) {
      return { ...invoice, earlierShop: true };
    }
    throw new ApiError('not_found', 'InvoiceNotFound', {});
  }

  /** BIL-13, LIF-21: the owner's earlier, deleted shops, whose invoices stay the owner's. Staff see none. */
  private async earlierShopsOf(request: DashboardRequest, tenantId: string): Promise<string[]> {
    const session = request.session;
    if (!session || session.userId !== null) return [];
    const shops = await this.tenants.runStandalone((tx) =>
      this.tenants.findDeletedShopsOf(tx, session.subscriberId),
    );
    return shops.map((shop) => shop.id).filter((id) => id !== tenantId);
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
