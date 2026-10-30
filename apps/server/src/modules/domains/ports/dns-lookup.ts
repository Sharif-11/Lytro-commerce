/**
 * TEN-11: what a domain's DNS says. Each answer is empty when the name has no such record; a lookup that could not be
 * made (the resolver failed or timed out) throws, so a passing outage never counts as a missing record.
 */
export interface DnsLookup {
  /** The names a CNAME record at this name points to, lower case, without the trailing dot. */
  cnames(name: string): Promise<string[]>;
  /** The IPv4 addresses the name resolves to, CNAMEs followed. */
  addresses(name: string): Promise<string[]>;
  /** The TXT records at this name, each joined from its parts. */
  texts(name: string): Promise<string[]>;
}
