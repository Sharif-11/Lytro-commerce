import { z } from 'zod';
import { LISTENER_DOWNLOAD_DEFAULT_URL } from '@lytronix/validators';
import { serverRoleSchema } from './server-role';

// SEC-10: a key for the secret box, 32 bytes written in base64.
const encryptionKey = z
  .string()
  .refine(
    (value) => /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32,
    {
      message: 'must be 32 random bytes, base64 (openssl rand -base64 32)',
    },
  );

// Every setting the server reads, validated once at startup (ENGINEERING-STANDARDS §2).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // D9-11: `api`, `worker` or `all` (the default: one process does both, as in development and tests).
  SERVER_ROLE: serverRoleSchema,
  // The release this process runs, the commit its image was built from; /health reports it, so a deploy can check it.
  RELEASE: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required; copy apps/server/.env.example to .env'),
  // WAL-09 (Phase 5 Slice 5.7): bKash's Tokenized Checkout, host and version. Its production address is to be confirmed with bKash.
  BKASH_SANDBOX_URL: z.string().url().default('https://tokenized.sandbox.bka.sh/v2'),
  BKASH_PRODUCTION_URL: z.string().url().default('https://tokenized.pay.bka.sh/v2'),
  // Phase 6 Slice 6.1: Steadfast's API. It has no sandbox, so every booking on it is real.
  STEADFAST_API_URL: z.string().url().default('https://portal.packzy.com/api/v1'),
  // Slice 6.3: Pathao's API, and the value its page says to answer its messages with. Without it, messages are still answered, which its
  // document says is enough unless an account is strict.
  PATHAO_API_URL: z.string().url().default('https://api-hermes.pathao.com/aladdin/api/v1'),
  PATHAO_WEBHOOK_INTEGRATION_SECRET: z.string().min(1).optional(),
  // Slice 6.4: RedX's API, and Lytro's own RedX token, used only to read its area list (read agreed 2026-11-06). Without it the list
  // can't be read, and RedX can't book until it has been.
  REDX_API_URL: z.string().url().default('https://openapi.redx.com.bd/v1.0.0-beta'),
  REDX_AREAS_TOKEN: z.string().min(1).optional(),
  // Phase 7 Slice 7.1 (D7-2, D7-21): BulkSMSBD, only ever over HTTPS. Its login is required in production, staging
  // included; in development the stand-in logs each SMS unless SMS_FORCE_REAL is set, and then the login is required.
  BULKSMSBD_BASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'must be an https address' })
    .default('https://bulksmsbd.net/api'),
  BULKSMSBD_API_KEY: z.string().min(1).optional(),
  BULKSMSBD_SENDER_ID: z.string().min(1).optional(),
  SMS_FORCE_REAL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Phase 7 Slice 7.6 (D7-4, D7-22): Gemini, which reads a customer's delivery details from a pasted message, only over
  // HTTPS. Its key is required in production, staging included; in development a stand-in answers unless AI_FORCE_REAL
  // is set, and then the key is required. The key's Google project must have billing on (D7-18).
  GEMINI_BASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'must be an https address' })
    .default('https://generativelanguage.googleapis.com/v1beta'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  AI_FORCE_REAL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Phase 7 Slice 7.3 (D7-3, D7-22): Resend sends Lytro's email, only over HTTPS, from MAIL_FROM. Its key and its
  // webhook's signing secret (NTF-06's bounces) are required in production, staging included; in development the
  // stand-in prints each email unless EMAIL_FORCE_REAL is set, and then the key is required.
  RESEND_BASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'must be an https address' })
    .default('https://api.resend.com'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_[A-Za-z0-9+/=]+$/, { message: "must be Resend's whsec_ signing secret" })
    .optional(),
  MAIL_FROM: z.string().min(3).default('Lytro <no-reply@mail.lytro.app>'),
  EMAIL_FORCE_REAL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Phase 7 Slice 7.3 (NTF-02, D7-22): web push, signed with Lytro's VAPID keys (base64url, as web-push makes them). The
  // keys are required in production, staging included; in development the stand-in logs each push unless PUSH_FORCE_REAL
  // is set, and then the keys are required. VAPID_SUBJECT is how a push service reaches Lytro about its pushes.
  VAPID_PUBLIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{80,100}$/, { message: 'must be a base64url VAPID public key' })
    .optional(),
  VAPID_PRIVATE_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{40,50}$/, { message: 'must be a base64url VAPID private key' })
    .optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/)
    .default('mailto:no-reply@mail.lytro.app'),
  PUSH_FORCE_REAL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
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
  // TENANT-DASHBOARD-DESIGN §7.44: where the listener app's file and its latest.json live, as the website has it --
  // download-staging.lytro.app on staging, which doesn't follow from PLATFORM_DOMAIN.
  LISTENER_DOWNLOAD_URL: z.string().url().default(LISTENER_DOWNLOAD_DEFAULT_URL),
  // The edge (any proxy in front of the server) adds this secret to every request it forwards (decision R3).
  TRUSTED_EDGE_SECRET: z.string().min(32).optional(),
  // A second accepted secret, set only while the edge's secret is being rotated (no downtime).
  TRUSTED_EDGE_SECRET_NEXT: z.string().min(32).optional(),
  // Slice 12: the secret the storefront's own server presents to read a shop's storefront key, which the edge never
  // adds, so no request through the edge reads one. Unset in development, where the route is open.
  STOREFRONT_SECRET: z.string().min(32).optional(),
  // Slice 13 (TEN-11): the platform's public IPv4 addresses, comma-separated -- what a root domain's A record must point
  // at to be verified, and what its page tells the seller to enter. Required in production.
  PLATFORM_ADDRESSES: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address !== ''),
    )
    .pipe(z.array(z.string().ip({ version: 'v4' }))),
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
  // SMS-11, D7-27 (Phase 7 Slice 7.1): code SMS one client address may ask for in an hour, across every phone. Only
  // production defaults to the strict value (20), for the same reason: the e2e suites ask from one loopback address.
  CODE_SMS_PER_IP_PER_HOUR: z.coerce.number().int().positive().optional(),
  // AUTH-09: free-trial shop creations per verified identity and per client IP, each counted over a rolling
  // window (days). Same reasoning as SIGNUP_RATE_LIMIT_PER_IP above -- nearly every e2e test calls POST
  // /shops more than once from the same loopback IP, so only production defaults to the strict SRS value.
  TRIAL_LIMIT_PER_IDENTITY: z.coerce.number().int().positive().optional(),
  // DAT-55 (Slice 9.6): what a second server would cost a month, in taka. Unset, revenue never says it's time for one;
  // the paying shops' count still does.
  SECOND_SERVER_MONTHLY_TAKA: z.coerce.number().positive().optional(),
  // OBS-03 (Slice 9.6): Sentry's address for the server's errors; unset, none are sent. Its environment names the server.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().trim().min(1).default('production'),
  // D9-20 (Slice 9.6): JSON log lines (production's default) or Nest's readable text (everywhere else's).
  LOG_FORMAT: z.enum(['json', 'text']).optional(),
  TRIAL_LIMIT_PER_IP: z.coerce.number().int().positive().optional(),
  TRIAL_LIMIT_WINDOW_DAYS: z.coerce.number().int().positive().optional(),
  // Connection pool (ENGINEERING-STANDARDS §5). Defaults suit one server; size the total for each deployment.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  // D9-13, DAT-45: the read pool, as the read-only role (SELECT only, read-only transactions). Code marks a read for it
  // explicitly; everything else writes. Unset (a developer's database), reads go through the write pool.
  DATABASE_READ_URL: z.string().min(1).optional(),
  // Slice 9.4 (D9-1, D9-15, RED-01 to RED-05): the shared Redis that keeps every API copy's limits in one count
  // (redis://:<password>@redis:6379). Without it each process counts alone, which is right for one process (a
  // developer's machine, the tests); the servers always set it.
  REDIS_URL: z.string().min(1).optional(),
  // Slice 9.2 (D9-13, DAT-23): the API reaches the database through PgBouncer, which sets the statement and transaction
  // limits on every connection it opens (deploy/pgbouncer). A client's own would be refused there, so none is sent.
  DATABASE_THROUGH_POOLER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // DAT-23: how long a transaction may stay open on a direct connection (the worker's), PostgreSQL 17's
  // transaction_timeout. Unset sends none: PostgreSQL 16, which a developer's database may be, doesn't know it.
  DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
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
  // ADM-14, ADM-17, D8-47: payment screenshots, in a private bucket the public Worker has no binding to. The processing and
  // deletion keys need access to it.
  MEDIA_EVIDENCE_BUCKET: z.string().min(3).default('lytro-evidence'),
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
  // MED-10, MED-13, BND-01, BND-02: the media Worker's side of Cloudflare -- one API token that may read the usage
  // dataset (Account Analytics: Read) and write the shared store (Workers KV Storage: Edit), the account it is in,
  // the store's namespace and the dataset's name. Left unset, bandwidth is neither counted nor enforced, and nothing
  // else changes.
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  MEDIA_EDGE_KV_NAMESPACE_ID: z.string().min(1).optional(),
  MEDIA_USAGE_DATASET: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .default('lytro_media_usage'),
  // SEC-01, SEC-10: the key credentials are sealed with (32 random bytes, base64), set from a secrets manager on real
  // servers, never from a file in the repository; and the key before it, while a rotation moves values over.
  DATA_ENCRYPTION_KEY: encryptionKey.optional(),
  DATA_ENCRYPTION_PREVIOUS_KEY: encryptionKey.optional(),
});

const envWithEdgeRule = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.TRUSTED_EDGE_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TRUSTED_EDGE_SECRET'],
      message: 'required in production; at least 32 characters',
    });
  }
  // Slice 13: without the platform's address no root domain can be verified, nor told what to point at.
  if (value.NODE_ENV === 'production' && value.PLATFORM_ADDRESSES.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PLATFORM_ADDRESSES'],
      message: 'required in production: the IPv4 addresses a root domain points at',
    });
  }
  // Slice 12a: unset, the route that hands out each shop's storefront key is open, which only development may allow.
  if (value.NODE_ENV === 'production' && !value.STOREFRONT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STOREFRONT_SECRET'],
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
  // MED-10, BND-02: the media Worker's Cloudflare side is on only with its account and store as well as its token.
  if (value.CLOUDFLARE_API_TOKEN) {
    for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'MEDIA_EDGE_KV_NAMESPACE_ID'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required when CLOUDFLARE_API_TOKEN is set',
        });
      }
    }
  }
  // D7-21: a server that sends SMS for real never quietly falls back to logging them.
  if (
    value.NODE_ENV === 'production' ||
    (value.NODE_ENV === 'development' && value.SMS_FORCE_REAL)
  ) {
    for (const key of ['BULKSMSBD_API_KEY', 'BULKSMSBD_SENDER_ID'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message:
            value.NODE_ENV === 'production'
              ? 'required in production: SMS are sent for real'
              : 'required when SMS_FORCE_REAL is set',
        });
      }
    }
  }
  // D7-22: a server that sends email for real never quietly falls back to printing it, and in production it must be able
  // to hear of a bounce (NTF-06).
  if (
    (value.NODE_ENV === 'production' ||
      (value.NODE_ENV === 'development' && value.EMAIL_FORCE_REAL)) &&
    !value.RESEND_API_KEY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message:
        value.NODE_ENV === 'production'
          ? 'required in production: email is sent for real'
          : 'required when EMAIL_FORCE_REAL is set',
    });
  }
  if (value.NODE_ENV === 'production' && !value.RESEND_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_WEBHOOK_SECRET'],
      message: "required in production: bounces are only believed with Resend's signature",
    });
  }
  // D7-22: a server that pushes for real never quietly falls back to logging, and signs every push.
  if (
    value.NODE_ENV === 'production' ||
    (value.NODE_ENV === 'development' && value.PUSH_FORCE_REAL)
  ) {
    for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message:
            value.NODE_ENV === 'production'
              ? 'required in production: push is sent for real'
              : 'required when PUSH_FORCE_REAL is set',
        });
      }
    }
  }
  // D7-22: a server that reads messages with Gemini for real never quietly falls back to the stand-in.
  if (
    (value.NODE_ENV === 'production' ||
      (value.NODE_ENV === 'development' && value.AI_FORCE_REAL)) &&
    !value.GEMINI_API_KEY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message:
        value.NODE_ENV === 'production'
          ? 'required in production: messages are read by Gemini'
          : 'required when AI_FORCE_REAL is set',
    });
  }
  if (value.NODE_ENV === 'production' && !value.DATA_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATA_ENCRYPTION_KEY'],
      message: 'required in production: 32 random bytes, base64',
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
