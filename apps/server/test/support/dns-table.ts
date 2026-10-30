import type { DnsLookup } from '../../src/modules/domains/ports/dns-lookup';

/** One name's records, as a domain's DNS would hold them. */
export interface DnsRecords {
  cname?: string[];
  a?: string[];
  txt?: string[];
}

/** DNS as a table the test writes: each name's CNAMEs, addresses and TXT records; `down` makes every lookup fail. */
export class DnsTable implements DnsLookup {
  down = false;

  constructor(readonly records: Record<string, DnsRecords> = {}) {}

  set(name: string, records: DnsRecords): void {
    this.records[name] = records;
  }

  clear(name: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a test's DNS loses one name's records
    delete this.records[name];
  }

  cnames(name: string): Promise<string[]> {
    return this.answer(this.records[name]?.cname);
  }

  addresses(name: string): Promise<string[]> {
    return this.answer(this.records[name]?.a);
  }

  texts(name: string): Promise<string[]> {
    return this.answer(this.records[name]?.txt);
  }

  private answer(records: string[] | undefined): Promise<string[]> {
    return this.down ? Promise.reject(new Error('ESERVFAIL')) : Promise.resolve(records ?? []);
  }
}
