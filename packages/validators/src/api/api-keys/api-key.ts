import { z } from 'zod';
import { API_KEY_NAME_MAX_LENGTH, API_KEY_WEBSITES_MAX } from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';

// API-08, RTE-07: the hosts a shop may test a public key from without HTTPS.
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * API-01, API-08: a registered website address, as the browser sends it in `Origin`: a scheme, a host and a port
 * when it is not the scheme's own, and nothing else. HTTPS, except for a shop testing from its own machine. Stored
 * normalised (lower-case host, the default port dropped), so it is matched exactly.
 */
export const websiteAddressField = z
  .string()
  .trim()
  .max(255)
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a website address, such as https://myshop.com.',
        params: { problem: FieldProblemCode.InvalidUrl },
      });
      return z.NEVER;
    }
    const secure = url.protocol === 'https:';
    const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
    const bare =
      (url.pathname === '/' || url.pathname === '') &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === '';
    if (!(secure || local) || !bare) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use the address only, starting with https://, with no path after it.',
        params: { problem: FieldProblemCode.InvalidUrl },
      });
      return z.NEVER;
    }
    return url.origin;
  });

const websitesField = z
  .array(websiteAddressField)
  .min(1)
  .max(API_KEY_WEBSITES_MAX)
  .transform((addresses) => [...new Set(addresses)]);

const apiKeyNameField = z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH);

// POST api-keys (API-01): a public key's name, the website addresses it may be used from, and when it stops working
// (left out, never). The key itself is made by the server and shown once.
export const createApiKeySchema = z.object({
  name: apiKeyNameField,
  websites: websitesField,
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// PATCH api-keys/:id (API-01): a live key's name or website addresses.
export const updateApiKeySchema = z.object({
  name: apiKeyNameField.optional(),
  websites: websitesField.optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
