import { z } from 'zod';

// Every setting the server reads, validated once at startup (ENGINEERING-STANDARDS §2).
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
  // TEN-29: the dashboard's and the operator console's own origins. A state-changing request carrying another
  // Origin is refused. Default in production: https://app.<PLATFORM_DOMAIN> and https://admin.<PLATFORM_DOMAIN>.
  DASHBOARD_ORIGIN: z.string().url().optional(),
  OPERATOR_ORIGIN: z.string().url().optional(),
  // The edge (any proxy in front of the server) adds this secret to every request it forwards (decision R3).
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
  // SUP-08: new accounts per client IP per hour. The SRS value (10) is tight for a shared test or dev
  // machine that creates many tenants from one address in a single run, so only production defaults to it;
  // the limiter itself is identical in every environment — this only changes the threshold.
  SIGNUP_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().optional(),
  // AUTH-09: free-trial shop creations per verified identity and per client IP, each counted over a rolling
  // window (days). Same reasoning as SIGNUP_RATE_LIMIT_PER_IP above -- nearly every e2e test calls POST
  // /shops more than once from the same loopback IP, so only production defaults to the strict SRS value.
  TRIAL_LIMIT_PER_IDENTITY: z.coerce.number().int().positive().optional(),
  TRIAL_LIMIT_PER_IP: z.coerce.number().int().positive().optional(),
  TRIAL_LIMIT_WINDOW_DAYS: z.coerce.number().int().positive().optional(),
  // Connection pool (ENGINEERING-STANDARDS §5). Defaults suit one server; size the total for each deployment.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  // Google and Facebook sign-in (AUTH-24). Off until the provider is registered; the flow stays tested either way.
  GOOGLE_SIGN_IN_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  FACEBOOK_SIGN_IN_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FACEBOOK_APP_ID: z.string().min(1).optional(),
  FACEBOOK_APP_SECRET: z.string().min(1).optional(),
  // Where the provider sends the browser back to; the callback address is this base plus the provider route.
  OAUTH_CALLBACK_BASE: z.string().min(1).default('http://localhost:3000'),
  // D3-4, MED-01: the S3-compatible store tenant media lives in -- Cloudflare R2, with dev buckets for development and
  // CI. Left unset, media is off: an upload answers that storage is unavailable, and nothing else changes. R2 accepts
  // path-style addressing.
  MEDIA_STORAGE_ENDPOINT: z.string().url().optional(),
  MEDIA_STORAGE_REGION: z.string().min(1).default('auto'),
  MEDIA_STORAGE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // MED-03: the temporary bucket browsers upload into, and the bucket each shop's media lives in under its prefix.
  MEDIA_UPLOADS_BUCKET: z.string().min(3).default('lytro-uploads'),
  MEDIA_BUCKET: z.string().min(3).default('lytro-media'),
  // MED-07: one key per job -- signing a browser's upload, processing it, deleting objects -- each with the least it
  // needs, kept out of the repository and rotated every 90 days.
  MEDIA_SIGNER_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_SIGNER_SECRET_KEY: z.string().min(1).optional(),
  MEDIA_PROCESSOR_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_PROCESSOR_SECRET_KEY: z.string().min(1).optional(),
  MEDIA_DELETER_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_DELETER_SECRET_KEY: z.string().min(1).optional(),
  // MED-08: where public media is read from (the media Worker's address, Slice 7; the local store in development).
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
});

const envWithEdgeRule = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.TRUSTED_EDGE_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TRUSTED_EDGE_SECRET'],
      message: 'required in production; at least 32 characters',
    });
  }
  if (value.GOOGLE_SIGN_IN_ENABLED && (!value.GOOGLE_CLIENT_ID || !value.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GOOGLE_CLIENT_ID'],
      message: 'required when GOOGLE_SIGN_IN_ENABLED is true',
    });
  }
  if (value.FACEBOOK_SIGN_IN_ENABLED && (!value.FACEBOOK_APP_ID || !value.FACEBOOK_APP_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FACEBOOK_APP_ID'],
      message: 'required when FACEBOOK_SIGN_IN_ENABLED is true',
    });
  }
  // D3-4, MED-07: media is on only with its store and all three keys; half a set would fail at the first upload.
  if (value.MEDIA_STORAGE_ENDPOINT) {
    for (const key of [
      'MEDIA_SIGNER_ACCESS_KEY',
      'MEDIA_SIGNER_SECRET_KEY',
      'MEDIA_PROCESSOR_ACCESS_KEY',
      'MEDIA_PROCESSOR_SECRET_KEY',
      'MEDIA_DELETER_ACCESS_KEY',
      'MEDIA_DELETER_SECRET_KEY',
      'MEDIA_PUBLIC_BASE_URL',
    ] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required when MEDIA_STORAGE_ENDPOINT is set',
        });
      }
    }
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
