import { domainTwinOf, domainUsesCname, normalizeDomain } from '@lytronix/validators';
import type { DomainRecord, DomainView, ShopDomain } from '../../src/types/domain';

// The shop's own domain as the server answers it (GET /domain, TEN-09 to TEN-14), and the page's writes, kept so a read
// after shows what changed. An add is refused as the server refuses it: not a domain, or active on another shop (the
// drawing's rahim.com); a check finds the records once `findsRecords` is set.

const OURS = '203.0.113.10';
const SHOP_HOST = 'megh.lytro.app';
const TAKEN = 'rahim.com';

export interface DomainFixture extends DomainView {
  /** Check now finds the records, and the domain becomes active. */
  findsRecords?: boolean;
}

/** The records a page asks for: a www name's CNAME, else the A and TXT records; the twin's apart. */
function recordsOf(host: string): DomainRecord[] {
  if (domainUsesCname(host)) return [{ type: 'CNAME', name: 'www', value: SHOP_HOST }];
  return [
    { type: 'A', name: '@', value: OURS },
    { type: 'TXT', name: '_lytro', value: 'lytro=megh' },
  ];
}

function twinRecordsOf(twin: string): DomainRecord[] {
  return domainUsesCname(twin)
    ? [{ type: 'CNAME', name: 'www', value: SHOP_HOST }]
    : [{ type: 'A', name: '@', value: OURS }];
}

/** The drawn shop's domain in a state: megh.com (or www.megh.com), waiting unless said. */
export function drawnDomain(
  state: ShopDomain['state'] = 'pending',
  values: Partial<ShopDomain> = {},
): ShopDomain {
  const hostname = values.hostname ?? 'megh.com';
  const twin = domainTwinOf(hostname);
  return {
    hostname,
    twin,
    state,
    lost: false,
    twinActive: state === 'active',
    records: recordsOf(hostname),
    twinRecords: twinRecordsOf(twin),
    addedAt: new Date(Date.now() - 3_600_000).toISOString(),
    checkedAt: new Date().toISOString(),
    verifiedAt: state === 'active' || state === 'off' ? new Date().toISOString() : null,
    ...values,
  };
}

/** No domain yet, on a plan that includes one. */
export function noDomain(): DomainFixture {
  return { allowed: true, domain: null };
}

function view(fixture: DomainFixture): DomainView {
  return { allowed: fixture.allowed, domain: fixture.domain };
}

/** The shop's main address while its own domain serves, as /me names it. */
export function ownDomainOf(fixture: DomainFixture): string | null {
  return fixture.domain?.state === 'active' ? fixture.domain.hostname : null;
}

/** GET /domain, else undefined. */
export function domainAnswer(path: string, fixture: DomainFixture): unknown {
  return path === '/domain' ? view(fixture) : undefined;
}

type Refused = { refused: { status: number; code: string; message: string; details: unknown } };

function fieldRefusal(status: number, code: string, problem: string, message: string): Refused {
  return {
    refused: {
      status,
      code,
      message,
      details: { fields: [{ field: 'hostname', problem, message }] },
    },
  };
}

/** A domain write, kept in the fixture, or undefined when the path is not the page's. */
export function domainWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: DomainFixture,
  language: 'bn' | 'en',
): { data: unknown } | Refused | undefined {
  if (method === 'POST' && path === '/domain') {
    const hostname = normalizeDomain(typeof body?.hostname === 'string' ? body.hostname : '');
    if (hostname === null) {
      return fieldRefusal(
        400,
        'validation_error',
        'invalid_format',
        language === 'bn' ? 'megh.com-এর মতো একটা ডোমেইন লিখুন।' : 'Enter a domain like megh.com.',
      );
    }
    if (hostname === TAKEN) {
      return fieldRefusal(
        409,
        'conflict',
        'taken',
        language === 'bn'
          ? 'এই ডোমেইন আরেকটা শপে চালু আছে।'
          : 'This domain is active on another shop.',
      );
    }
    fixture.domain = drawnDomain('pending', { hostname });
    return { data: view(fixture) };
  }
  if (method === 'POST' && path === '/domain/check' && fixture.domain) {
    const found = fixture.findsRecords === true;
    fixture.domain = {
      ...fixture.domain,
      state: found ? 'active' : 'pending',
      lost: found ? false : fixture.domain.lost,
      twinActive: found,
      checkedAt: new Date().toISOString(),
      verifiedAt: found ? new Date().toISOString() : null,
    };
    return { data: view(fixture) };
  }
  if (method === 'DELETE' && path === '/domain') {
    fixture.domain = null;
    return { data: view(fixture) };
  }
  return undefined;
}
