import { Module } from '@nestjs/common';
import {
  DrizzleBillingTermsStore,
  DrizzlePlanAssignmentsStore,
  DrizzlePlanLimitOverridesStore,
  DrizzlePlansStore,
} from '../../database/adapters/billing.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { PaymentsModule } from '../payments/payments.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PlansService } from './services/plans.service';
import { BillingTermsService } from './services/billing-terms.service';
import { PlanAssignmentService } from './services/plan-assignment.service';
import { PlanLimitOverridesService } from './services/plan-limit-overrides.service';
import { PaymentQueueService } from './services/payment-queue.service';
import { PurchaseService } from './services/purchase.service';
import { TrialLifecycleService } from './services/trial-lifecycle.service';
import { UpgradeService } from './services/upgrade.service';
import {
  BILLING_TERMS_STORE,
  CLOCK,
  PLAN_ASSIGNMENTS_STORE,
  PLAN_LIMIT_OVERRIDES_STORE,
  PLANS_STORE,
} from './tokens';

// D2-8: the billing module -- plan/term CRUD, versioning, not-for-sale assignment, per-tenant limit overrides
// (PLN-01 to PLN-12, PLN-16 to PLN-18, TRM-01 to TRM-16). API-only this slice (D2-9's resolution): no screens,
// no shell -- every UI piece is slice 8.
@Module({
  imports: [TenancyModule, AuditModule, BalanceModule, PaymentsModule],
  providers: [
    { provide: PLANS_STORE, useClass: DrizzlePlansStore },
    { provide: BILLING_TERMS_STORE, useClass: DrizzleBillingTermsStore },
    { provide: PLAN_ASSIGNMENTS_STORE, useClass: DrizzlePlanAssignmentsStore },
    { provide: PLAN_LIMIT_OVERRIDES_STORE, useClass: DrizzlePlanLimitOverridesStore },
    { provide: CLOCK, useValue: (): Date => new Date() },
    PlansService,
    BillingTermsService,
    PlanAssignmentService,
    PlanLimitOverridesService,
    TrialLifecycleService,
    PurchaseService,
    UpgradeService,
    PaymentQueueService,
  ],
  exports: [
    PlansService,
    BillingTermsService,
    PlanAssignmentService,
    PlanLimitOverridesService,
    TrialLifecycleService,
    PurchaseService,
    UpgradeService,
    PaymentQueueService,
  ],
})
export class BillingModule {}
