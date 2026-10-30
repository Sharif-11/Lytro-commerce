import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { taxClassSchema, taxClassUpdateSchema, taxDefaultSchema } from '@lytronix/validators';

// TAX-01 (Slice 4.6a): DTO classes built from the shared schemas, so each request shape is written once.
export class TaxClassDto extends createZodDto(taxClassSchema) {}
export class TaxClassUpdateDto extends createZodDto(taxClassUpdateSchema) {}
export class TaxDefaultDto extends createZodDto(taxDefaultSchema) {}

export class TaxClassesViewDto extends createZodDto(
  z.object({
    classes: z.array(z.object({ id: z.string(), name: z.string(), rate: z.string() })),
    defaultId: z.string().nullable(),
  }),
) {}
