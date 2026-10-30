// TEN-09 to TEN-14 (Slice 13): the Domain page's read, as GET /domain sends it.

/** One record the seller adds where they bought the domain. */
export interface DomainRecord {
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  value: string;
}

/** Waiting for its records, active (the main address), not verified in 3 days, or off with a plan without it. */
export type DomainState = 'pending' | 'active' | 'failed' | 'off';

export interface ShopDomain {
  hostname: string;
  twin: string;
  state: DomainState;
  /** Back to waiting because its record went missing on two checks running. */
  lost: boolean;
  /** The twin's record points here, so the twin leads to the domain too. */
  twinActive: boolean;
  records: DomainRecord[];
  twinRecords: DomainRecord[];
  addedAt: string;
  checkedAt: string | null;
  verifiedAt: string | null;
}

export interface DomainView {
  /** The shop's plan (or an add-on) includes its own domain (TEN-10, PYG-07). */
  allowed: boolean;
  domain: ShopDomain | null;
}
