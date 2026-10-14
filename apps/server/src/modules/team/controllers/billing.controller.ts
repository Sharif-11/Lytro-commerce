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
import { PurchaseService } from '../../billing/services/purchase.service';
import { UpgradeService } from '../../billing/services/upgrade.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import {
  ConfirmPurchaseDto,
  ConfirmUpgradeDto,
  QuotePurchaseDto,
  QuoteUpgradeDto,
} from '../dto/billing.dto';
import { InvoiceDto, InvoiceListDto, PlanPaymentDto } from '../dto/billing-response.dto';

// BIL-01 to BIL-13: a tenant's own purchase/renewal flow and invoices.
@ApiTags('Billing')
@Controller('billing')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BillingController {
  constructor(
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
  ) {}

  @Post('quote')
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

  @Get('invoices')
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('InvoicesListed')
  @ApiOperation({ summary: "List the shop's invoices" })
  @ZodResponse({ type: InvoiceListDto })
  listInvoices(@Req() request: DashboardRequest): Promise<InvoiceRecord[]> {
    return this.invoices.listForTenant(this.tenantIdOf(request));
  }

  @Get('invoices/:id')
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
