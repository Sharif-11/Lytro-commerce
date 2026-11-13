import { Inject, Injectable } from '@nestjs/common';
import type { CapacityFigures } from '@lytronix/db';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { Leases } from '../../shared/limits/services/leases';
import { OperatorAlerts } from '../../shared/mail/services/operator-alerts';
import type { MonitoringDatabase } from '../ports/monitoring-database';
import { MONITORING_CLOCK, MONITORING_DATABASE } from '../tokens';

/** DAT-55: a second server is due once this many shops pay for a plan. */
export const PAYING_SHOPS_FOR_SECOND_SERVER = 30;
/** DAT-55: or once the plans bring in more than this many times what the second server would cost a month. */
export const REVENUE_OVER_SERVER_COST = 4;
/** Told again each 30 days while a reason holds, until the second server is added. */
const REMIND_MS = 30 * 24 * 60 * 60_000;

export interface CapacityVerdict {
  figures: CapacityFigures;
  /** The reasons told this time (`capacity:paying-shops`, `capacity:revenue`); none while each was told lately. */
  told: string[];
}

/**
 * DAT-55 (Slice 9.6): whether it's time for the standby, by two of DAT-55's measures: paying shops and the plans'
 * revenue against the second server's cost (SECOND_SERVER_MONTHLY_TAKA; without it, revenue says nothing). The third,
 * the server's peak load at half its ceiling, is Grafana's alert on the server's own figures. The operators are emailed
 * once a reason first holds, and again each 30 days while it does.
 */
@Injectable()
export class CapacityCheck {
  constructor(
    @Inject(MONITORING_DATABASE)
    private readonly database: Pick<MonitoringDatabase, 'capacityFigures'>,
    @Inject(OperatorAlerts) private readonly alerts: Pick<OperatorAlerts, 'alert'>,
    @Inject(Leases) private readonly leases: Pick<Leases, 'once'>,
    @Inject(ENV) private readonly env: Pick<Env, 'SECOND_SERVER_MONTHLY_TAKA'>,
    @Inject(MONITORING_CLOCK) private readonly clock: () => Date,
  ) {}

  async run(): Promise<CapacityVerdict> {
    const now = this.clock();
    const figures = await this.database.capacityFigures();
    const reasons: { key: string; line: string }[] = [];
    if (figures.payingShops >= PAYING_SHOPS_FOR_SECOND_SERVER) {
      reasons.push({
        key: 'capacity:paying-shops',
        line: `${String(figures.payingShops)} shops pay for a plan (the second server is due at ${String(PAYING_SHOPS_FOR_SECOND_SERVER)}).`,
      });
    }
    const cost = this.env.SECOND_SERVER_MONTHLY_TAKA;
    if (cost !== undefined && figures.monthlyRevenue > REVENUE_OVER_SERVER_COST * cost) {
      reasons.push({
        key: 'capacity:revenue',
        line: `The plans bring in ${figures.monthlyRevenue.toFixed(2)} TK a month, over ${String(REVENUE_OVER_SERVER_COST)} times the second server's ${String(cost)} TK.`,
      });
    }
    const told: { key: string; line: string }[] = [];
    for (const reason of reasons) {
      if (await this.leases.once(reason.key, REMIND_MS, now)) told.push(reason);
    }
    if (told.length > 0) {
      await this.alerts.alert(
        'Time to add the second server (DAT-55)',
        [
          ...told.map((reason) => reason.line),
          '',
          'DAT-55 adds the standby at the first of these. RUNBOOKS.md, "Adding the second server", says how.',
          'This is told again each 30 days while it holds.',
        ].join('\n'),
      );
    }
    return { figures, told: told.map((reason) => reason.key) };
  }
}
