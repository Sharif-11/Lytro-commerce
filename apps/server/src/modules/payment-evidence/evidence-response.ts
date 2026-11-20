import type { EvidenceFile } from './services/payment-evidence';

/** The parts of an Express response a screenshot is written with. */
export interface EvidenceResponse {
  status(code: number): EvidenceResponse;
  set(headers: Record<string, string>): EvidenceResponse;
  send(body: Buffer): unknown;
}

/**
 * D8-47 (amended 2026-11-20): a payment screenshot answered by the server itself, never through a link, to the operator's
 * console. A seller sent it, so it is never sniffed into something else and runs nothing if opened on its own (`sandbox`),
 * and neither the browser nor anything between keeps a copy.
 */
export function sendEvidence(response: EvidenceResponse, file: EvidenceFile): void {
  response
    .status(200)
    .set({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    })
    .send(file.body);
}
