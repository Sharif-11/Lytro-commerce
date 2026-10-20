import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { SmsKind } from '@lytronix/validators';
import { usageCycleStart } from '../../../common/time';
import { countSmsParts } from '../../shared/messaging/sms-parts';
import type { EssentialSmsUsageStore } from '../ports/essential-sms-usage-store';
import { ESSENTIAL_SMS_USAGE_STORE } from '../tokens';

export interface EssentialSmsUsage {
  monthly: number;
  total: number;
}

/**
 * AUTH-21: the tenant's free essential-SMS allowance usage. A sign-up code or a password-reset code is
 * platform cost and never recorded here; a sign-in code to an *already-existing* shop is the owner's own
 * choice (they have a password and could have skipped the SMS) and counts. The shop-ready SMS (SMS-18) is
 * itself platform cost -- it's what makes the shop usable in the first place -- and also never counted.
 */
@Injectable()
export class EssentialSmsUsageService {
  constructor(@Inject(ESSENTIAL_SMS_USAGE_STORE) private readonly store: EssentialSmsUsageStore) {}

  recordSigninOtp(tx: Transaction, tenantId: string, body: string): Promise<void> {
    const { parts } = countSmsParts(body);
    return this.store.record(tx, { tenantId, kind: SmsKind.Otp, parts });
  }

  async currentUsage(tenantId: string, now: Date): Promise<EssentialSmsUsage> {
    const tenant = await this.store.findCycleTenant(tenantId);
    const cycleStart = tenant ? usageCycleStart(tenant, now) : now;
    const [monthly, total] = await Promise.all([
      this.store.sumPartsSince(tenantId, cycleStart),
      this.store.sumPartsSince(tenantId, null),
    ]);
    return { monthly, total };
  }
}
