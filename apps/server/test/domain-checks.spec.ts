import { describe, expect, it } from 'vitest';
import { AuditAction, DomainStatus } from '@lytronix/validators';
import type { Env } from '../src/config/env';
import { HOUR_MS, MINUTE_MS } from '../src/common/time';
import { domainCheckDue, domainCheckOutcome } from '../src/modules/domains/services/domain-checks';
import { DomainRecords } from '../src/modules/domains/services/domain-records';
import { DomainVerifier } from '../src/modules/domains/services/domain-verifier';
import type { DomainRow } from '../src/modules/domains/types/domain';
import { DnsTable } from './support/dns-table';

// TEN-11 (Slice 13's read, points 1 and 5): what a check makes of a domain, and when one is due -- pure rules, no DNS
// and no database -- and what the verifier accepts as pointing here for a shop.

const NOW = new Date('2026-10-30T06:00:00Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

function domain(values: Partial<DomainRow> = {}): DomainRow {
  return {
    id: 'domain-1',
    tenantId: 'shop-1',
    hostname: 'megh.com',
    twin: 'www.megh.com',
    twinActive: false,
    status: DomainStatus.Pending,
    verifiedAt: null,
    createdAt: ago(HOUR_MS),
    pendingSince: ago(HOUR_MS),
    checkedAt: null,
    missedChecks: 0,
    lostAt: null,
    removedAt: null,
    ...values,
  };
}

const active = (values: Partial<DomainRow> = {}): DomainRow =>
  domain({
    status: DomainStatus.Active,
    verifiedAt: ago(5 * HOUR_MS),
    checkedAt: ago(HOUR_MS),
    ...values,
  });

describe('a waiting domain', () => {
  it('becomes active when its record is found, its twin with it when the twin points here', () => {
    expect(domainCheckOutcome(domain(), 'found', 'found', NOW)).toEqual({
      patch: {
        checkedAt: NOW,
        status: DomainStatus.Active,
        verifiedAt: NOW,
        missedChecks: 0,
        lostAt: null,
        twinActive: true,
      },
      event: AuditAction.DomainActivated,
      servingChanged: true,
    });
    expect(domainCheckOutcome(domain(), 'found', 'missing', NOW).patch.twinActive).toBe(false);
  });

  it('a domain back from a lost record clears it when found again', () => {
    const lost = domain({ lostAt: ago(HOUR_MS) });
    expect(domainCheckOutcome(lost, 'found', 'missing', NOW).patch.lostAt).toBeNull();
  });

  it('keeps waiting for 72 hours, then could not be verified', () => {
    expect(
      domainCheckOutcome(domain({ pendingSince: ago(71 * HOUR_MS) }), 'missing', 'missing', NOW),
    ).toEqual({
      patch: { checkedAt: NOW },
      event: null,
      servingChanged: false,
    });
    expect(
      domainCheckOutcome(domain({ pendingSince: ago(72 * HOUR_MS) }), 'missing', 'missing', NOW)
        .patch,
    ).toEqual({ checkedAt: NOW, status: DomainStatus.Failed });
  });

  it('counts a check DNS could not answer toward the 72 hours, never as a check made', () => {
    expect(domainCheckOutcome(domain(), 'unknown', 'missing', NOW).patch).toEqual({});
    expect(
      domainCheckOutcome(domain({ pendingSince: ago(73 * HOUR_MS) }), 'unknown', 'missing', NOW)
        .patch,
    ).toEqual({ status: DomainStatus.Failed });
  });
});

describe('an active domain', () => {
  it('stays active while its record is there, its twin following its own record', () => {
    expect(domainCheckOutcome(active({ missedChecks: 1 }), 'found', 'found', NOW)).toEqual({
      patch: { checkedAt: NOW, missedChecks: 0, twinActive: true },
      event: null,
      servingChanged: true,
    });
    expect(domainCheckOutcome(active({ twinActive: true }), 'found', 'missing', NOW)).toEqual({
      patch: { checkedAt: NOW, missedChecks: 0, twinActive: false },
      event: null,
      servingChanged: true,
    });
    expect(
      domainCheckOutcome(active({ twinActive: true }), 'found', 'unknown', NOW).patch.twinActive,
    ).toBe(true);
  });

  it('is waiting again after two checks running without its record', () => {
    const once = domainCheckOutcome(active(), 'missing', 'missing', NOW);
    expect(once).toEqual({
      patch: { checkedAt: NOW, missedChecks: 1 },
      event: null,
      servingChanged: false,
    });
    expect(
      domainCheckOutcome(active({ missedChecks: 1, twinActive: true }), 'missing', 'missing', NOW),
    ).toEqual({
      patch: {
        checkedAt: NOW,
        status: DomainStatus.Pending,
        pendingSince: NOW,
        lostAt: NOW,
        missedChecks: 0,
        twinActive: false,
      },
      event: AuditAction.DomainLost,
      servingChanged: true,
    });
  });

  it('changes nothing when DNS could not be asked', () => {
    expect(domainCheckOutcome(active({ missedChecks: 1 }), 'unknown', 'unknown', NOW)).toEqual({
      patch: {},
      event: null,
      servingChanged: false,
    });
  });
});

describe('when a domain is due a check', () => {
  it('checks a waiting domain every run and an active one once a day', () => {
    expect(domainCheckDue(domain({ checkedAt: ago(MINUTE_MS) }), NOW)).toBe(true);
    expect(domainCheckDue(active({ checkedAt: null }), NOW)).toBe(true);
    expect(domainCheckDue(active({ checkedAt: ago(23 * HOUR_MS) }), NOW)).toBe(false);
    // A run a few minutes early still counts as the day's check, so the check never slips a run each day.
    expect(domainCheckDue(active({ checkedAt: ago(24 * HOUR_MS - 4 * MINUTE_MS) }), NOW)).toBe(
      true,
    );
  });

  it('never checks one that could not be verified or was removed', () => {
    expect(domainCheckDue(domain({ status: DomainStatus.Failed }), NOW)).toBe(false);
    expect(domainCheckDue(domain({ status: DomainStatus.Removed }), NOW)).toBe(false);
  });
});

const ENV = { PLATFORM_DOMAIN: 'lytro.app', PLATFORM_ADDRESSES: ['203.0.113.10'] } as Env;
const OURS = '203.0.113.10';

function verifierOver(dns: DnsTable): DomainVerifier {
  return new DomainVerifier(dns, new DomainRecords(ENV));
}

describe('what points here for a shop (TEN-11, TEN-12)', () => {
  it("accepts a CNAME to the shop's own address", async () => {
    const verifier = verifierOver(
      new DnsTable({ 'www.megh.com': { cname: ['megh.lytro.app'], a: [OURS] } }),
    );
    expect(await verifier.domain('www.megh.com', 'megh')).toBe('found');
    // The same CNAME names another shop, never this one.
    expect(await verifier.domain('www.megh.com', 'rahim')).toBe('missing');
  });

  it("accepts A records all the platform's with the TXT naming the shop, and nothing less", async () => {
    const root = (a: string[], txt: string[]): DomainVerifier =>
      verifierOver(new DnsTable({ 'megh.com': { a }, '_lytro.megh.com': { txt } }));
    expect(await root([OURS], ['lytro=megh']).domain('megh.com', 'megh')).toBe('found');
    expect(await root([OURS], []).domain('megh.com', 'megh')).toBe('missing');
    expect(await root([OURS], ['lytro=rahim']).domain('megh.com', 'megh')).toBe('missing');
    expect(await root([OURS, '198.51.100.7'], ['lytro=megh']).domain('megh.com', 'megh')).toBe(
      'missing',
    );
    expect(await root([], ['lytro=megh']).domain('megh.com', 'megh')).toBe('missing');
  });

  it("leads the twin here by a CNAME to the shop or to the domain, or by the platform's addresses", async () => {
    const twin = (records: { cname?: string[]; a?: string[] }): Promise<string> =>
      verifierOver(new DnsTable({ 'www.megh.com': records })).twin(
        'www.megh.com',
        'megh.com',
        'megh',
      );
    expect(await twin({ cname: ['megh.lytro.app'] })).toBe('found');
    expect(await twin({ cname: ['megh.com'] })).toBe('found');
    expect(await twin({ a: [OURS] })).toBe('found');
    expect(await twin({ cname: ['elsewhere.example'], a: ['198.51.100.7'] })).toBe('missing');
  });

  it("answers 'unknown' when DNS cannot be asked, never 'missing'", async () => {
    const dns = new DnsTable({});
    dns.down = true;
    expect(await verifierOver(dns).domain('megh.com', 'megh')).toBe('unknown');
    expect(await verifierOver(dns).twin('www.megh.com', 'megh.com', 'megh')).toBe('unknown');
  });
});

describe('the records a page asks for (Slice 13 point 1)', () => {
  const records = new DomainRecords(ENV);

  it('asks a root domain for the A and TXT records, and its www twin for a CNAME', () => {
    expect(records.forDomain('megh.com', 'megh')).toEqual([
      { type: 'A', name: '@', value: OURS },
      { type: 'TXT', name: '_lytro', value: 'lytro=megh' },
    ]);
    expect(records.forTwin('www.megh.com', 'megh')).toEqual([
      { type: 'CNAME', name: 'www', value: 'megh.lytro.app' },
    ]);
  });

  it('asks a www name for one CNAME, and its root twin for the A record', () => {
    expect(records.forDomain('www.megh.com.bd', 'megh')).toEqual([
      { type: 'CNAME', name: 'www', value: 'megh.lytro.app' },
    ]);
    expect(records.forTwin('megh.com.bd', 'megh')).toEqual([{ type: 'A', name: '@', value: OURS }]);
  });
});
