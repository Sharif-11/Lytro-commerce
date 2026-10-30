import type { DomainToCheckRow, SelectTenantDomain } from '@lytronix/db';
import type { featureOn } from '@lytronix/validators';

/** TEN-09: a shop's own domain as stored. */
export type DomainRow = SelectTenantDomain;

/** TEN-11: a domain the recurring check looks at, with the shop address its records must name. */
export type DomainToCheck = DomainToCheckRow;

/** PLN-13: what decides whether the shop's plan includes its own domain -- its plan's features and its add-ons. */
export type FeatureHoldings = Parameters<typeof featureOn>[1];

/** TEN-11: one DNS answer -- the record is there, it is not, or DNS could not be asked. */
export type DnsAnswer = 'found' | 'missing' | 'unknown';

/** One record the seller adds where they bought the domain, named the way the domain's seller asks for it. */
export interface DomainRecordView {
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  value: string;
}

/**
 * The domain's state on its page: waiting for its records, active (the shop's main address), not verified in 72 hours,
 * or active but off because the shop's plan does not include it (DWN-10).
 */
export type DomainState = 'pending' | 'active' | 'failed' | 'off';

/** TEN-09 to TEN-14: the Domain page's read. */
export interface DomainView {
  /** The shop's plan (or an add-on) includes its own domain (TEN-10, PYG-07). */
  allowed: boolean;
  domain: {
    hostname: string;
    twin: string;
    state: DomainState;
    /** Back to waiting because its record went missing on two checks running. */
    lost: boolean;
    /** The twin's record points here, so the twin leads to the domain too. */
    twinActive: boolean;
    records: DomainRecordView[];
    twinRecords: DomainRecordView[];
    addedAt: string;
    checkedAt: string | null;
    verifiedAt: string | null;
  } | null;
}
