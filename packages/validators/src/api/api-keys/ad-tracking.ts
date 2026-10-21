import { z } from 'zod';

// LND-15: a Meta Pixel ID is digits only.
const PIXEL_ID_PATTERN = /^\d{5,20}$/;
// LND-16: a Conversions API access token, as Meta issues it.
const CONVERSIONS_API_TOKEN_MAX_LENGTH = 512;

// PUT ad-tracking (LND-15 to LND-17): the Meta Pixel ID, null to disconnect it; and the Conversions API token, which
// is written and never read back: left out it stays as it is, null removes it.
export const updateAdTrackingSchema = z.object({
  metaPixelId: z.string().trim().regex(PIXEL_ID_PATTERN).nullable(),
  conversionsApiToken: z
    .string()
    .trim()
    .min(1)
    .max(CONVERSIONS_API_TOKEN_MAX_LENGTH)
    .nullable()
    .optional(),
});
export type UpdateAdTrackingInput = z.infer<typeof updateAdTrackingSchema>;
