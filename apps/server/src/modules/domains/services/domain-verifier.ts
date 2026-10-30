import { Inject, Injectable } from '@nestjs/common';
import { DOMAIN_TXT_LABEL, domainTxtValue } from '@lytronix/validators';
import type { DnsLookup } from '../ports/dns-lookup';
import { DNS_LOOKUP } from '../tokens';
import type { DnsAnswer } from '../types/domain';
import { DomainRecords } from './domain-records';

/**
 * TEN-11, TEN-12: whether a domain's records point here for this shop. Either way the page shows is accepted: a CNAME
 * to the shop's own address, or A records all the platform's with the TXT record naming the shop -- so only the shop
 * its records name can verify it. A lookup that fails is 'unknown', never 'missing'.
 */
@Injectable()
export class DomainVerifier {
  constructor(
    @Inject(DNS_LOOKUP) private readonly dns: DnsLookup,
    @Inject(DomainRecords) private readonly records: DomainRecords,
  ) {}

  async domain(hostname: string, slug: string): Promise<DnsAnswer> {
    try {
      if (await this.cnamesTo(hostname, [this.records.shopHost(slug)])) return 'found';
      const [addresses, texts] = await Promise.all([
        this.dns.addresses(hostname),
        this.dns.texts(`${DOMAIN_TXT_LABEL}.${hostname}`),
      ]);
      return this.allOurs(addresses) && texts.includes(domainTxtValue(slug)) ? 'found' : 'missing';
    } catch {
      return 'unknown';
    }
  }

  /** The twin leads here: a CNAME to the shop's address or to the domain itself, or A records all the platform's. */
  async twin(twin: string, hostname: string, slug: string): Promise<DnsAnswer> {
    try {
      if (await this.cnamesTo(twin, [this.records.shopHost(slug), hostname])) return 'found';
      return this.allOurs(await this.dns.addresses(twin)) ? 'found' : 'missing';
    } catch {
      return 'unknown';
    }
  }

  private async cnamesTo(name: string, targets: string[]): Promise<boolean> {
    const cnames = await this.dns.cnames(name);
    return cnames.some((target) => targets.includes(target));
  }

  private allOurs(addresses: string[]): boolean {
    const ours = this.records.addresses;
    return addresses.length > 0 && addresses.every((address) => ours.includes(address));
  }
}
