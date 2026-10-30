import { Inject, Injectable } from '@nestjs/common';
import {
  DOMAIN_TXT_LABEL,
  domainRecordName,
  domainTxtValue,
  domainUsesCname,
} from '@lytronix/validators';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import type { DomainRecordView } from '../types/domain';

/**
 * TEN-11 (Slice 13's read, point 1): what a domain must point at, and the records its page asks for. A www name: one
 * CNAME to the shop's own address (it names the shop). Any other name: an A record to each of the platform's addresses
 * and a TXT record naming the shop. The twin needs no TXT: it only leads to the domain verified beside it.
 */
@Injectable()
export class DomainRecords {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** The platform's addresses a domain's A records must all be. */
  get addresses(): readonly string[] {
    return this.env.PLATFORM_ADDRESSES;
  }

  /** The shop's own address, which a www name's CNAME points to: megh.lytro.app. */
  shopHost(slug: string): string {
    return `${slug}.${this.env.PLATFORM_DOMAIN}`;
  }

  forDomain(hostname: string, slug: string): DomainRecordView[] {
    if (domainUsesCname(hostname)) return [this.cname(hostname, slug)];
    return [
      ...this.aRecords(hostname),
      {
        type: 'TXT',
        name: domainRecordName(`${DOMAIN_TXT_LABEL}.${hostname}`),
        value: domainTxtValue(slug),
      },
    ];
  }

  forTwin(twin: string, slug: string): DomainRecordView[] {
    return domainUsesCname(twin) ? [this.cname(twin, slug)] : this.aRecords(twin);
  }

  private cname(name: string, slug: string): DomainRecordView {
    return { type: 'CNAME', name: domainRecordName(name), value: this.shopHost(slug) };
  }

  private aRecords(name: string): DomainRecordView[] {
    return this.addresses.map((address) => ({
      type: 'A',
      name: domainRecordName(name),
      value: address,
    }));
  }
}
