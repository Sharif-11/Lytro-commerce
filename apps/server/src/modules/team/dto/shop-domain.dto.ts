import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { addDomainSchema } from '@lytronix/validators';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class AddDomainDto extends createZodDto(addDomainSchema) {}

const domainRecordSchema = z.object({
  type: z.enum(['A', 'CNAME', 'TXT']),
  name: z.string(),
  value: z.string(),
});

// TEN-09 to TEN-14, DWN-10: the Domain page's read -- whether the plan includes a domain, and the shop's domain with its
// state, the records to add for it and for its twin, and when it was added, last checked and verified.
const domainViewSchema = z.object({
  allowed: z.boolean(),
  domain: z
    .object({
      hostname: z.string(),
      twin: z.string(),
      state: z.enum(['pending', 'active', 'failed', 'off']),
      lost: z.boolean(),
      twinActive: z.boolean(),
      records: z.array(domainRecordSchema),
      twinRecords: z.array(domainRecordSchema),
      addedAt: z.string().datetime(),
      checkedAt: z.string().datetime().nullable(),
      verifiedAt: z.string().datetime().nullable(),
    })
    .nullable(),
});
export class DomainViewDto extends createZodDto(domainViewSchema) {}
