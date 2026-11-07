import { Logger } from '@nestjs/common';
import type { AddressReader, ReaderAnswer } from '../ports/address-reader';
import { latinDigits } from '../services/address-details';

// A Bangladeshi mobile number as written: Bangla or Latin digits, an optional +88, spaces or dashes inside.
const WRITTEN_MOBILE = /(?:\+?88)?0\s*1[3-9](?:[\s-]*\d){8}/;

/**
 * D7-22 (Phase 7 Slice 7.6): what reads messages in development unless AI_FORCE_REAL is set, and the default in tests,
 * so no message leaves the machine and nothing costs money. It finds a mobile number and nothing else, and says so in
 * the log, never the message itself.
 */
export class StandInAddressReader implements AddressReader {
  private readonly logger = new Logger('AddressReader');

  read(text: string, model: string): Promise<ReaderAnswer> {
    const phone = WRITTEN_MOBILE.exec(latinDigits(text))?.[0] ?? null;
    this.logger.log(
      `stand-in read of ${String(text.length)} characters (would ask ${model}); found ${phone ? 'a phone' : 'nothing'}`,
    );
    return Promise.resolve({
      kind: 'read',
      details: { name: null, phone, zilla: null, thana: null, address: null, note: null },
    });
  }
}
