import { Resolver } from 'node:dns/promises';
import { Injectable } from '@nestjs/common';
import type { DnsLookup } from '../ports/dns-lookup';

// How long one lookup may take, and how many times the resolver tries it, before the check counts it as not asked.
const LOOKUP_TIMEOUT_MS = 5_000;
const LOOKUP_TRIES = 2;
// The answers that mean the name has no such record, as against a resolver that could not answer.
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND']);

/** TEN-11: the system's resolver, asked the way a shopper's browser would find the domain. */
@Injectable()
export class NodeDnsLookup implements DnsLookup {
  private readonly resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: LOOKUP_TRIES });

  async cnames(name: string): Promise<string[]> {
    const names = await this.orNone(this.resolver.resolveCname(name));
    return names.map((target) => target.toLowerCase().replace(/\.$/, ''));
  }

  addresses(name: string): Promise<string[]> {
    return this.orNone(this.resolver.resolve4(name));
  }

  async texts(name: string): Promise<string[]> {
    const records = await this.orNone(this.resolver.resolveTxt(name));
    return records.map((parts) => parts.join(''));
  }

  private async orNone<T>(lookup: Promise<T[]>): Promise<T[]> {
    try {
      return await lookup;
    } catch (error) {
      if (NO_RECORD.has((error as NodeJS.ErrnoException).code ?? '')) return [];
      throw error;
    }
  }
}
