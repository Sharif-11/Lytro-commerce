import { Inject, Injectable } from '@nestjs/common';
import {
  PlanPaymentKind,
  PlatformSettingKey,
  TenantState,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { TenantService } from '../../tenancy/services/tenant.service';

const DEFAULT_MIN_AMOUNT = 100;
const DEFAULT_MAX_AMOUNT = 50000;

// BAL-06 (amended): top-up is available to every plan type, trial included -- the owner may fund the
// balance ahead of buying a plan, e.g. to try a paid feature during the trial. Every lapsed state is still
// refused below (the balance is frozen then, independent of plan type).
const TOP_UP_ALLOWED_STATES: ReadonlySet<TenantState> = new Set([
  TenantState.Trial,
  TenantState.Active,
  TenantState.Grace,
  TenantState.PayAsYouGo,
]);

/**
 * BAL-03 to BAL-06: quoting and submitting a balance top-up. The actual credit only happens once an operator
 * approves it from the payment-queue (D2-1) -- see `PaymentQueueService.approve` in the `billing` module,
 * which this service deliberately does not depend on, to keep `balance` from importing `billing`.
 */
@Injectable()
export class TopUpService {
  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  async quote(tenantId: string, amount: string): Promise<PlanPaymentRecord> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    if (!TOP_UP_ALLOWED_STATES.has(info.state)) {
      throw new ApiError('tenant_offline', 'TopUpNotAvailable', {});
    }

    const [min, max] = await Promise.all([
      this.settings.current(PlatformSettingKey.TopUpMinAmount),
      this.settings.current(PlatformSettingKey.TopUpMaxAmount),
    ]);
    const minAmount = typeof min?.value === 'number' ? min.value : DEFAULT_MIN_AMOUNT;
    const maxAmount = typeof max?.value === 'number' ? max.value : DEFAULT_MAX_AMOUNT;
    const requested = Number(amount);
    if (requested < minAmount || requested > maxAmount) {
      throw new FieldsError(
        [
          {
            field: 'amount',
            problem: ServerFieldProblemCode.OutOfRange,
            messageKey: 'AmountOutOfRange',
            params: { min: minAmount, max: maxAmount },
            min: minAmount,
            max: maxAmount,
          },
        ],
        'validation_error',
        { min: minAmount, max: maxAmount },
      );
    }

    return this.payments.quoteStandalone({
      tenantId,
      kind: PlanPaymentKind.TopUp,
      planId: null,
      billingTermId: null,
      amount,
      creditAmount: '0',
    });
  }

  /** BAL-03/16: the tenant's "I have paid" wallet submission -- enters the queue, credits nothing yet. */
  submit(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input, PlanPaymentKind.TopUp);
  }
}
