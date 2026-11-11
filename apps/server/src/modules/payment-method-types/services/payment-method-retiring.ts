import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectPaymentMethodType, Transaction } from '@lytronix/db';
import {
  ACCOUNT_METHODS,
  AuditAction,
  AuditResult,
  PAYMENT_METHOD_TYPES,
  PlatformActorType,
  PlatformAuditAction,
  RetireState,
  type AccountMethod,
  type PaymentMethodKind,
  type PaymentMethodTypeReasonInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PlanOperator } from '../../billing/services/plans.service';
import { LytroPaymentMethods } from '../../lytro-payments/services/lytro-payment-methods';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type {
  PaymentMethodNotifier,
  PaymentMethodTypeNotice,
} from '../ports/payment-method-notifier';
import { PAYMENT_METHOD_NOTIFIER, PAYMENT_METHOD_TYPES_CLOCK } from '../tokens';
import { PaymentMethodTypes } from './payment-method-types';

/** WAL-18 (Slice 8.7): a payment method type as the operator sees it, and what leans on it. */
export interface OperatorPaymentMethodTypeView {
  method: AccountMethod;
  kind: PaymentMethodKind;
  state: RetireState;
  retiringSince: Date | null;
  removedAt: Date | null;
  /** Shops with it switched on, shops with an account saved for it, and shoppers' payments still open on it. */
  shopsOn: number;
  shopsWithAccounts: number;
  openPayments: number;
  /**
   * D8-65, D8-66: the shops that set it up -- switched it on, or saved an account for it, each counted once -- which are the
   * shops a retire or its undo tells. A shop may have it on with no account (WAL-05), so neither count above says this.
   */
  shopsSetUp: number;
  /** Whether Lytro's own payment page takes it, which the operator turns off there (D8-67). */
  lytroTakes: boolean;
}

interface Tally {
  shopsOn: number;
  shopsWithAccounts: number;
  openPayments: number;
  shopsSetUp: number;
}

const NONE: Tally = { shopsOn: 0, shopsWithAccounts: 0, openPayments: 0, shopsSetUp: 0 };

/**
 * WAL-18 (Phase 8 Slice 8.7, read agreed 2026-11-10, D8-18, D8-65 to D8-67): the operator retiring a payment method type,
 * bringing it back, and removing it for good, the couriers' way (CourierRetiring). Retiring hides the type from every shop that
 * hasn't set it up, while one that has -- switched it on, or saved an account for it -- keeps taking money by it, checkout
 * included, and is told in Lytro's own words; Lytro's own payment page is left as the operator set it. Undoing tells the same
 * shops it is back. Removal waits until no shop has it on, no shopper's payment is open on it and Lytro's own page doesn't take
 * it; then every shop's accounts for it go, its past payments stay, and its code goes in a later change. The operator's reason
 * is for the platform audit log only.
 */
@Injectable()
export class PaymentMethodRetiring {
  private readonly logger = new Logger('PaymentMethodRetiring');

  constructor(
    @Inject(PaymentMethodTypes) private readonly types: PaymentMethodTypes,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(LytroPaymentMethods) private readonly lytro: LytroPaymentMethods,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(PAYMENT_METHOD_NOTIFIER) private readonly notifier: PaymentMethodNotifier,
    @Inject(PAYMENT_METHOD_TYPES_CLOCK) private readonly clock: () => Date,
  ) {}

  /** Every type, its state and what leans on it, in the methods' own order. */
  async list(): Promise<OperatorPaymentMethodTypeView[]> {
    const states = await this.types.states();
    const tallies = await this.tallies();
    return Promise.all(
      ACCOUNT_METHODS.map(async (method) =>
        this.viewOf(
          method,
          states.get(method),
          tallies.get(method),
          await this.lytro.takes(method),
        ),
      ),
    );
  }

  /** D8-65, D8-66: retires a type, telling every shop that set it up. */
  async retire(
    method: AccountMethod,
    input: PaymentMethodTypeReasonInput,
    operator: PlanOperator,
  ): Promise<{ type: OperatorPaymentMethodTypeView; told: number }> {
    const now = this.clock();
    const row = await this.types.run(async (tx) => {
      const held = await this.types.lockWithin(tx, method);
      if (held.state === RetireState.Removed) {
        throw new ApiError('not_found', 'PaymentMethodNotFound', {});
      }
      if (held.state === RetireState.Retiring) {
        throw new ApiError('conflict', 'PaymentMethodAlreadyRetiring', {});
      }
      const saved = await this.types.saveWithin(
        tx,
        method,
        { state: RetireState.Retiring, retiringSince: now, removedAt: null },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.PaymentMethodTypeRetired, {
        method,
        reason: input.reason,
      });
      return saved;
    });
    const told = await this.tellShops(method, AuditAction.PaymentMethodRetiring, (notice) =>
      this.notifier.methodRetiring(notice),
    );
    return { type: await this.viewFor(method, row), told };
  }

  /** D8-66: brings a retiring type back; the shops that set it up are told. */
  async undo(
    method: AccountMethod,
    input: PaymentMethodTypeReasonInput,
    operator: PlanOperator,
  ): Promise<{ type: OperatorPaymentMethodTypeView; told: number }> {
    const now = this.clock();
    const row = await this.types.run(async (tx) => {
      const held = await this.types.lockWithin(tx, method);
      if (held.state !== RetireState.Retiring) {
        throw new ApiError('conflict', 'PaymentMethodNotRetiring', {});
      }
      const saved = await this.types.saveWithin(
        tx,
        method,
        { state: RetireState.Active, retiringSince: null, removedAt: null },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.PaymentMethodTypeRetireUndone, {
        method,
        reason: input.reason,
      });
      return saved;
    });
    const told = await this.tellShops(method, AuditAction.PaymentMethodRetiringUndone, (notice) =>
      this.notifier.methodBack(notice),
    );
    return { type: await this.viewFor(method, row), told };
  }

  /**
   * D8-67: removes a retiring type once nothing holds it back. Its row is held exclusively while the check runs, and a shop
   * switching a type on, or Lytro's own page turning it on, reads it shared, so a change already in flight finishes first and is
   * counted, and none starts after. Then every shop's accounts for it go. Asked again once removed, it finishes taking away
   * whatever was left.
   */
  async remove(
    method: AccountMethod,
    input: PaymentMethodTypeReasonInput,
    operator: PlanOperator,
  ): Promise<{ type: OperatorPaymentMethodTypeView; cleared: number }> {
    const now = this.clock();
    const row = await this.types.run(async (tx) => {
      const held = await this.types.lockWithin(tx, method);
      if (held.state === RetireState.Removed) return held;
      if (held.state !== RetireState.Retiring) {
        throw new ApiError('conflict', 'PaymentMethodNotRetiring', {});
      }
      const tally = (await this.tallies()).get(method) ?? NONE;
      const lytroTakes = await this.lytro.takes(method);
      if (tally.shopsOn > 0 || tally.openPayments > 0 || lytroTakes) {
        throw new ApiError('conflict', 'PaymentMethodRemovalBlocked', {
          shopsOn: tally.shopsOn,
          openPayments: tally.openPayments,
          lytroTakes,
        });
      }
      const saved = await this.types.saveWithin(
        tx,
        method,
        { state: RetireState.Removed, retiringSince: held.retiringSince, removedAt: now },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.PaymentMethodTypeRemoved, {
        method,
        reason: input.reason,
      });
      return saved;
    });
    let cleared = 0;
    for (const shopId of await this.methods.shopIds()) {
      try {
        if (await this.methods.forgetType(shopId, method)) cleared += 1;
      } catch (error) {
        this.logger.error(`taking ${method} away from tenant ${shopId} failed`, error as Error);
      }
    }
    return { type: await this.viewFor(method, row), cleared };
  }

  /** Each shop that set the type up gets the change in its activity log, then the notice, after that commits. */
  private async tellShops(
    method: AccountMethod,
    action: AuditAction.PaymentMethodRetiring | AuditAction.PaymentMethodRetiringUndone,
    send: (notice: PaymentMethodTypeNotice) => Promise<void>,
  ): Promise<number> {
    let told = 0;
    for (const shopId of await this.methods.shopIds()) {
      try {
        if (!(await this.methods.noteTypeChange(shopId, method, action))) continue;
        told += 1;
        await this.tell(() => send({ tenantId: shopId, method }));
      } catch (error) {
        this.logger.error(`telling tenant ${shopId} about ${method} failed`, error as Error);
      }
    }
    return told;
  }

  private async tallies(): Promise<Map<AccountMethod, Tally>> {
    const tallies = new Map<AccountMethod, Tally>();
    for (const shopId of await this.methods.shopIds()) {
      for (const [method, use] of await this.methods.typeUse(shopId)) {
        const tally = tallies.get(method) ?? { ...NONE };
        tally.shopsOn += use.on ? 1 : 0;
        tally.shopsWithAccounts += use.accounts > 0 ? 1 : 0;
        tally.openPayments += use.openPayments;
        tally.shopsSetUp += use.setUp ? 1 : 0;
        tallies.set(method, tally);
      }
    }
    return tallies;
  }

  private async viewFor(
    method: AccountMethod,
    row: SelectPaymentMethodType,
  ): Promise<OperatorPaymentMethodTypeView> {
    return this.viewOf(
      method,
      row,
      (await this.tallies()).get(method),
      await this.lytro.takes(method),
    );
  }

  private viewOf(
    method: AccountMethod,
    row: SelectPaymentMethodType | undefined,
    tally: Tally | undefined,
    lytroTakes: boolean,
  ): OperatorPaymentMethodTypeView {
    return {
      method,
      kind: PAYMENT_METHOD_TYPES[method].kind,
      state: row?.state ?? RetireState.Active,
      retiringSince: row?.retiringSince ?? null,
      removedAt: row?.removedAt ?? null,
      ...(tally ?? NONE),
      lytroTakes,
    };
  }

  private record(
    tx: Transaction,
    operator: PlanOperator,
    action: PlatformAuditAction,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType: 'payment_method_type',
      // The target column holds ids; the type is named in the summary.
      targetId: null,
      result: AuditResult.Success,
      ip: operator.ip,
      summary,
    });
  }

  /** After its transaction, so a notice never tells of what rolled back; failing to tell changes nothing. */
  private async tell(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error('could not tell a shop about a payment method type', error as Error);
    }
  }
}
