import { z } from 'zod';

/**
 * What one server process does (D9-11). `api` answers HTTP and starts no background work, so two of them can sit behind
 * Caddy and be replaced one at a time; `worker` runs every job (the job queue, its relay and the SMS and mail retries)
 * and still listens on its own port, which only its health check reaches; `all` does both, for development and tests,
 * where one process is the whole server.
 */
export const serverRoleSchema = z.enum(['all', 'api', 'worker']).default('all');

export type ServerRole = z.infer<typeof serverRoleSchema>;

/** Whether a process in this role runs background work: the job queue, its relay and the message retries. */
export function runsJobs(role: ServerRole): boolean {
  return role !== 'api';
}

/**
 * The role as `SERVER_ROLE` sets it, for code that runs before the settings are parsed (AppModule's imports are
 * decided when its file loads). The same schema as the parsed settings, so both agree.
 */
export function serverRoleOf(source: NodeJS.ProcessEnv): ServerRole {
  return serverRoleSchema.parse(source['SERVER_ROLE']);
}
