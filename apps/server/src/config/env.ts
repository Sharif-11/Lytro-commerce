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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration: ${problems.join('; ')}`);
  }
  return parsed.data;
}
