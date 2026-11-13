import { Inject, Injectable, Logger } from '@nestjs/common';
import { OperatorAlerts } from '../../mail/services/operator-alerts';
import type { LimitsDatabase } from '../ports/limits-database';
import { LIMITS_DATABASE } from '../tokens';

const SERVICE = 'redis';

/**
 * RED-05 (Slice 9.4; the owner's answer, 2026-11-13: "one email"): the shared Redis's outage, told to the operators
 * once when it starts and once when it ends, however many servers and API copies notice it. The database decides
 * which notice is the first (control.service_states). A failure here is logged, never passed to a shopper's request.
 */
@Injectable()
export class RedisOutage {
  private readonly log = new Logger(RedisOutage.name);

  constructor(
    @Inject(LIMITS_DATABASE) private readonly database: LimitsDatabase,
    @Inject(OperatorAlerts) private readonly alerts: Pick<OperatorAlerts, 'alert'>,
  ) {}

  async down(now: Date, reason: string): Promise<void> {
    try {
      if (!(await this.database.markDown(SERVICE, now))) return;
      await this.alerts.alert(
        'Redis is down: limits are counted on each server',
        [
          `The shared Redis stopped answering at ${now.toISOString()} (${reason}).`,
          'Lytro keeps working: each API process now counts the everyday limits on its own, at half each, so together',
          'they stay about the same. Orders, payment sessions, sign-in codes and listener pairing are counted in the',
          'database and are unaffected.',
          'Check the redis container on the server (docs/RUNBOOKS.md, "Redis is down"). Another email follows when it',
          'answers again.',
        ].join('\n'),
      );
    } catch (error) {
      this.log.error(`could not record Redis's outage: ${String(error)}`);
    }
  }

  async up(now: Date): Promise<void> {
    try {
      const since = await this.database.markUp(SERVICE, now);
      if (since === null) return;
      const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
      await this.alerts.alert(
        'Redis is back',
        `The shared Redis answers again since ${now.toISOString()}, after about ${String(minutes)} minute(s). Limits are counted together again.`,
      );
    } catch (error) {
      this.log.error(`could not record Redis's recovery: ${String(error)}`);
    }
  }
}
