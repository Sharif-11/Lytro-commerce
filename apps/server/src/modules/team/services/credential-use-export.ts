import { Inject, Injectable } from '@nestjs/common';
import type { CredentialUseRow } from '@lytronix/db';
import type { CredentialUsesExportQuery } from '@lytronix/validators';
import { toCsv } from '../../../common/csv';

/** SEC-11: the three logs of a shop's credential uses, read together in the shop's own context. */
export interface CredentialUseLog {
  between(tenantId: string, from: Date, to: Date): Promise<CredentialUseRow[]>;
}

export const CREDENTIAL_USE_LOG = Symbol('CREDENTIAL_USE_LOG');

// Bangladesh keeps one offset all year: a calendar day there starts at 18:00 UTC the day before.
const DHAKA_OFFSET = '+06:00';
const DAY_MS = 24 * 60 * 60_000;
const COLUMNS = ['time', 'credential', 'provider', 'action', 'reference', 'result'];

function dhakaTimeOf(at: Date): string {
  return new Date(at.getTime() + 6 * 60 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * SEC-11 (Phase 9 Slice 9.7): a shop's every automated use of its stored credentials over whole Asia/Dhaka days, as a CSV
 * the operator sends in a dispute: when (Dhaka time), whose credential (a courier's, a wallet gateway's, Meta's), what
 * for, the order or payment page it served, and whether it worked. Never a credential: no log holds one.
 */
@Injectable()
export class CredentialUseExport {
  constructor(@Inject(CREDENTIAL_USE_LOG) private readonly log: CredentialUseLog) {}

  async csv(
    tenantId: string,
    query: CredentialUsesExportQuery,
  ): Promise<{ fileName: string; csv: string }> {
    const from = new Date(`${query.dateFrom}T00:00:00${DHAKA_OFFSET}`);
    const to = new Date(new Date(`${query.dateTo}T00:00:00${DHAKA_OFFSET}`).getTime() + DAY_MS);
    const rows = await this.log.between(tenantId, from, to);
    const csv = toCsv(
      rows.map((row) => ({
        time: dhakaTimeOf(row.at),
        credential: row.kind,
        provider: row.provider,
        action: row.action,
        reference: row.reference,
        result: row.succeeded ? 'ok' : 'failed',
      })),
      COLUMNS,
    );
    return { fileName: `credential-uses-${query.dateFrom}-to-${query.dateTo}.csv`, csv };
  }
}
