import { z } from 'zod';
import { EVIDENCE_CONTENT_TYPES, EVIDENCE_MAX_BYTES } from '../../common/limits';

// ADM-14, ADM-17, D8-14, D8-15 (Phase 8 Slice 8.5): a screenshot of a payment, sent straight to the store by a signed
// link: the operator's for a manual entry, the seller's for an "I have paid". Only images and PDFs, at most 5 MB.
export const evidenceUploadSchema = z
  .object({
    contentType: z.enum(EVIDENCE_CONTENT_TYPES),
    bytes: z.number().int().positive().max(EVIDENCE_MAX_BYTES),
  })
  .strict();
export type EvidenceUploadInput = z.infer<typeof evidenceUploadSchema>;

// The key the upload's signed link was made for, as `POST .../evidence` returned it.
export const evidenceKeyField = z
  .string()
  .trim()
  .regex(/^evidence\/(?:operator|[0-9a-f-]{36})\/[0-9a-f-]{36}$/);
