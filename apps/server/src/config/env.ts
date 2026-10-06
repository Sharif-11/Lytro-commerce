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
  // The edge (any proxy in front of the server) adds this secret to every request it forwards (decision R3).
  // Required in production; unset in development, where the check is switched off.
  TRUSTED_EDGE_SECRET: z.string().min(32).optional(),
  // A second accepted secret, set only while the edge's secret is being rotated (no downtime).
  TRUSTED_EDGE_SECRET_NEXT: z.string().min(32).optional(),
  // The request header that carries the client's address, set by the edge (D14).
  CLIENT_IP_HEADER: z
    .string()
    .min(1)
    .default('x-forwarded-for')
    .transform((value) => value.toLowerCase()),
  // 'list': the header is a comma-separated chain (X-Forwarded-For). 'single': one address (for example X-Real-IP).
  CLIENT_IP_FORMAT: z.enum(['list', 'single']).default('list'),
  // How many trusted proxies append to a list. The client's address is the entry this many places from the end.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  // Key for the keyed hash of one-time codes (AUTH-05). A stolen database alone cannot reveal codes.
  OTP_SECRET: z.string().min(32, 'OTP_SECRET is required; at least 32 characters'),
  // Connection pool (ENGINEERING-STANDARDS §5). Defaults suit one server; size the total for each deployment.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

const envWithEdgeRule = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.TRUSTED_EDGE_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TRUSTED_EDGE_SECRET'],
      message: 'required in production; at least 32 characters',
    });
  }
  if (value.TRUSTED_EDGE_SECRET_NEXT && !value.TRUSTED_EDGE_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TRUSTED_EDGE_SECRET_NEXT'],
      message: 'can only be set together with TRUSTED_EDGE_SECRET',
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
