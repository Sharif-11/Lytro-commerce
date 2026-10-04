import { z } from 'zod';

// Every setting the server reads, validated once at startup (ENGINEERING-STANDARDS §2).
// A missing or malformed value stops the process with a message naming the variable.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required; copy apps/server/.env.example to .env'),
  // Base domain the platform serves shops under: <slug>.<PLATFORM_DOMAIN> (decision R1, R2).
  PLATFORM_DOMAIN: z
    .string()
    .min(1)
    .default('localhost')
    .transform((value) => value.toLowerCase()),
  // Shared secret that Cloudflare adds to every forwarded request (decision R3).
  // Required in production; empty in development, where the check is switched off.
  TRUSTED_EDGE_SECRET: z.string().min(32).optional(),
  // Key for the keyed hash of one-time codes (AUTH-05). A stolen database alone cannot reveal codes.
  OTP_SECRET: z.string().min(32, 'OTP_SECRET is required; at least 32 characters'),
});

const envWithEdgeRule = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.TRUSTED_EDGE_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TRUSTED_EDGE_SECRET'],
      message: 'required in production; at least 32 characters',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates the settings. Throws, naming each invalid variable, when the configuration is unusable. */
export class EnvironmentParser {
  parse(source: NodeJS.ProcessEnv = process.env): Env {
    const parsed = envWithEdgeRule.safeParse(source);
    if (!parsed.success) {
      const problems = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new Error(`Invalid environment configuration: ${problems.join('; ')}`);
    }
    return parsed.data;
  }
}
