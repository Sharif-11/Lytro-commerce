import {
  AuditAction,
  DOMAIN_CHECK_MINUTES,
  DOMAIN_MISSES_TO_FALL_BACK,
  DOMAIN_RECHECK_HOURS,
  DOMAIN_VERIFY_HOURS,
  DomainStatus,
} from '@lytronix/validators';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import type { DnsAnswer, DomainRow } from '../types/domain';

// TEN-11 (Slice 13's read, point 5): what one check makes of a domain. Pure, so every rule is tested without DNS or a
// database.

/** What a check writes, and the activity entry it makes, if any. */
export interface DomainCheckOutcome {
  patch: Partial<DomainRow>;
  event: AuditAction.DomainActivated | AuditAction.DomainLost | null;
  /** The domain started or stopped answering for the shop, its twin included: the host lookup must forget it. */
  servingChanged: boolean;
}

/**
 * Whether the recurring check looks at a domain now: a waiting one on every run (each 10 minutes), an active one once a
 * day -- a little early rather than a run late -- and never one that could not be verified until the seller asks.
 */
export function domainCheckDue(domain: DomainRow, now: Date): boolean {
  if (domain.status === DomainStatus.Pending) return true;
  if (domain.status !== DomainStatus.Active) return false;
  if (domain.checkedAt === null) return true;
  const recheckAfter = DOMAIN_RECHECK_HOURS * HOUR_MS - (DOMAIN_CHECK_MINUTES * MINUTE_MS) / 2;
  return now.getTime() - domain.checkedAt.getTime() >= recheckAfter;
}

/**
 * One check's result. A waiting domain whose record is found becomes active, its twin with it when the twin's record
 * points here too; one not found in 72 hours could not be verified. An active domain missing its record on two checks
 * running is waiting again, the shop back on its own address. A check DNS could not answer changes nothing but the
 * 72 hours.
 */
export function domainCheckOutcome(
  domain: DomainRow,
  answer: DnsAnswer,
  twin: DnsAnswer,
  now: Date,
): DomainCheckOutcome {
  const checked = answer === 'unknown' ? {} : { checkedAt: now };
  if (domain.status === DomainStatus.Active) {
    if (answer === 'found') {
      const twinActive = twin === 'unknown' ? domain.twinActive : twin === 'found';
      return {
        patch: { ...checked, missedChecks: 0, twinActive },
        event: null,
        servingChanged: twinActive !== domain.twinActive,
      };
    }
    if (answer === 'unknown') return { patch: {}, event: null, servingChanged: false };
    const missed = domain.missedChecks + 1;
    if (missed < DOMAIN_MISSES_TO_FALL_BACK) {
      return { patch: { ...checked, missedChecks: missed }, event: null, servingChanged: false };
    }
    return {
      patch: {
        ...checked,
        status: DomainStatus.Pending,
        pendingSince: now,
        lostAt: now,
        missedChecks: 0,
        twinActive: false,
      },
      event: AuditAction.DomainLost,
      servingChanged: true,
    };
  }
  if (answer === 'found') {
    return {
      patch: {
        ...checked,
        status: DomainStatus.Active,
        verifiedAt: now,
        missedChecks: 0,
        lostAt: null,
        twinActive: twin === 'found',
      },
      event: AuditAction.DomainActivated,
      servingChanged: true,
    };
  }
  const waited = now.getTime() - domain.pendingSince.getTime();
  if (waited >= DOMAIN_VERIFY_HOURS * HOUR_MS) {
    return {
      patch: { ...checked, status: DomainStatus.Failed },
      event: null,
      servingChanged: false,
    };
  }
  return { patch: checked, event: null, servingChanged: false };
}
