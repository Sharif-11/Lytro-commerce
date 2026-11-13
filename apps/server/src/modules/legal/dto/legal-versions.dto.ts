import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** LEG-01 (Slice 9.8): the versions in force, as `GET /legal-versions` answers them. */
export class LegalVersionsDto extends createZodDto(
  z.object({
    termsVersion: z.string(),
    privacyVersion: z.string(),
  }),
) {}

/** Cached a few minutes in the browser and on the way: it changes only when a new version takes effect. */
export const LEGAL_VERSIONS_CACHE = 'public, max-age=300';
