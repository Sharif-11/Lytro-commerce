import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  billingPaymentListQuerySchema,
  Permission,
  type BillingPaymentListQuery,
} from '@lytronix/validators';
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
import { AddonRenewalService } from '../../billing/services/addon-renewal.service';
import {
  DowngradeService,
  type DowngradeChecklist,
  type OverLimitItem,
  type PayAsYouGoChoice,
} from '../../billing/services/downgrade.service';
import { LifecycleService } from '../../billing/services/lifecycle.service';
import { PurchaseService } from '../../billing/services/purchase.service';
import { UpgradeService, type UpgradeQuote } from '../../billing/services/upgrade.service';
import type { PaymentAddon } from '../../billing/types/addon';
import type { ScheduledPlanChangeRecord } from '../../billing/types/scheduled-plan-change';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord, TenantPaymentRecord } from '../../payments/types/plan-payment';
import {
  ConfirmPurchaseDto,
  ConfirmUpgradeDto,
  QuotePurchaseDto,
  QuoteUpgradeDto,
  SetAutoRenewDto,
  TargetDowngradePlanDto,
} from '../dto/billing.dto';
import {
  BillingPaymentPageDto,
  CancellationStatusDto,
  DowngradeChecklistDto,
  InvoiceDto,
  InvoiceListDto,
  OverLimitItemListDto,
  PayAsYouGoChoiceDto,
  PlanPaymentDto,
  UpgradeQuoteDto,
  ScheduledPlanChangeDto,
} from '../dto/billing-response.dto';

/** An invoice as the billing screen lists it: this shop's own, or one from the owner's earlier shop. */
type ListedInvoice = InvoiceRecord & { earlierShop: boolean };

/** BIL-19: a payment as Billing lists it: with the add-ons it pays for, and whether it is an earlier shop's. */
type ListedPayment = TenantPaymentRecord & { addons: PaymentAddon[]; earlierShop: boolean };

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
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
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
  @ZodResponse({ type: UpgradeQuoteDto })
  quoteUpgrade(
    @Body(new ZodValidationPipe(QuoteUpgradeDto.schema)) body: QuoteUpgradeDto,
    @Req() request: DashboardRequest,
  ): Promise<UpgradeQuote> {
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

  // PYG-09: closing archives the shop and starts its deletion clock, so only the owner may do it. Deliberately
  // no @RequirePermission: PermissionGuard refuses every staff member on a route without one, whatever their role.
  @Post('close')
  @ResponseMessage('ShopClosed')
  @ApiOperation({
    summary: 'Close a pay-as-you-go shop now: archived at once, deleted after 60 days (owner only)',
  })
  @ZodResponse({ type: OkDto })
  async closePayAsYouGo(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.lifecycle.closePayAsYouGo(this.tenantIdOf(request), this.clientIp.resolve(request));
    return { ok: true };
  }

  @Get('downgrade/checklist')
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('DowngradeChecklistRetrieved')
  @ApiOperation({
    summary:
      "The last downgrade's checklist: each limit it left the shop over, ticked off as it is fixed (DWN-12, DWN-14)",
  })
  @ZodResponse({ type: DowngradeChecklistDto })
  async downgradeChecklist(
    @Req() request: DashboardRequest,
  ): Promise<{ checklist: DowngradeChecklist | null }> {
    return { checklist: await this.downgrade.checklist(this.tenantIdOf(request), new Date()) };
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

  // BIL-19: the shop's own payments to the platform, every one from its quote on, in one route: each row carries
  // everything the payment screen shows. Open in every lifecycle state, as the invoices are; the owner's earlier
  // shops' payments are listed with this shop's and marked (LIF-21).
  @Get('payments')
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('BillingPaymentsListed')
  @ApiOperation({
    summary: "The shop's payments to the platform, newest first, with their state (BIL-19)",
  })
  @ZodResponse({ type: BillingPaymentPageDto })
  async listPayments(
    @Query(new ZodValidationPipe(billingPaymentListQuerySchema)) query: BillingPaymentListQuery,
    @Req() request: DashboardRequest,
  ): Promise<{
    payments: ListedPayment[];
    page: number;
    limit: number;
    total: number;
    pages: number;
  }> {
    const tenantId = this.tenantIdOf(request);
    const earlier = await this.earlierShopsOf(request, tenantId);
    const { payments, total } = await this.payments.listForTenants([tenantId, ...earlier], query);
    const addons = await this.renewals.forPayments(payments.map((payment) => payment.id));
    return {
      payments: payments.map((payment) => this.listed(payment, tenantId, addons)),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }

  private listed(
    payment: TenantPaymentRecord,
    tenantId: string,
    addons: Map<string, PaymentAddon[]>,
  ): ListedPayment {
    return {
      ...payment,
      addons: addons.get(payment.id) ?? [],
      earlierShop: payment.tenantId !== tenantId,
    };
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
